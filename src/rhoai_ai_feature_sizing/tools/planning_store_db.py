"""Database-backed storage for planning artifacts."""

from typing import Any, Dict, List, Optional, Tuple
from datetime import datetime
import json
import uuid

from sqlalchemy.orm import Session as DBSession
from ..api.models import (
    create_session_factory,
    Session,
    Output,
    Stage,
    Epic,
    Story,
    EpicStatus,
    StoryStatus,
    Priority,
)

SessionFactory = create_session_factory()


def _db() -> DBSession:
    """Get a database session."""
    return SessionFactory()


def _get_or_create_session(
    db: DBSession, session_uuid: Optional[str], jira_key: str
) -> Session:
    """Get existing session by UUID or create/reuse by jira_key."""
    # Try exact DB session by UUID if provided
    if session_uuid:
        try:
            uid = uuid.UUID(session_uuid)
            s = db.query(Session).filter(Session.id == uid).first()
            if s:
                return s
        except Exception:
            pass

    # Else, reuse most recent session for this jira_key or create a new one
    s = (
        db.query(Session)
        .filter(Session.jira_key == jira_key)
        .order_by(Session.created_at.desc())
        .first()
    )
    if s:
        return s

    s = Session(jira_key=jira_key)
    db.add(s)
    db.flush()
    return s


def get_refinement(session_uuid: Optional[str], jira_key: str) -> str:
    """Get the latest refinement document."""
    with _db() as db:
        s = _get_or_create_session(db, session_uuid, jira_key)
        row = (
            db.query(Output)
            .filter(Output.session_id == s.id, Output.stage == Stage.REFINE)
            .order_by(Output.created_at.desc())
            .first()
        )
        return row.content if row else ""


def set_refinement(
    session_uuid: Optional[str], jira_key: str, content: str
) -> Tuple[str, str]:
    """Save refinement document and return (session_id, content)."""
    with _db() as db:
        s = _get_or_create_session(db, session_uuid, jira_key)
        # Insert new row as immutable history; most-recent is canonical
        out = Output(
            session_id=s.id,
            stage=Stage.REFINE,
            filename="refinement.md",
            content=content or "",
        )
        db.add(out)
        db.commit()
        return str(s.id), content or ""


def _normalize_plan(plan: Any) -> List[Dict[str, Any]]:
    """Normalize plan to list of epic dictionaries."""
    if plan is None:
        return []
    if isinstance(plan, dict):
        if "epics" in plan and isinstance(plan["epics"], list):
            return plan["epics"]
        # Fallback: coerce dict with a single epic
        return [plan]
    if isinstance(plan, list):
        return plan
    return []


def _read_plan_json(db: DBSession, session_id) -> Dict[str, Any]:
    """Read latest plan JSON from outputs table."""
    row = (
        db.query(Output)
        .filter(Output.session_id == session_id, Output.stage == Stage.JIRAS)
        .order_by(Output.created_at.desc())
        .first()
    )
    if not row:
        return {}
    try:
        return json.loads(row.content)
    except Exception:
        return {}


def get_jira_plan(session_uuid: Optional[str], jira_key: str) -> Dict[str, Any]:
    """Get JIRA plan, preferring normalized epics/stories tables."""
    with _db() as db:
        s = _get_or_create_session(db, session_uuid, jira_key)
        # Prefer reconstructing from normalized rows
        epics = (
            db.query(Epic)
            .filter(Epic.session_id == s.id)
            .order_by(Epic.created_at.asc())
            .all()
        )
        result = []
        for e in epics:
            stories = (
                db.query(Story)
                .filter(Story.epic_id == e.id)
                .order_by(Story.created_at.asc())
                .all()
            )
            result.append(
                {
                    "epic": e.title,
                    "component": e.component_team,
                    "description": e.description,
                    "stories": [st.title for st in stories],
                }
            )
        if result:
            return result
        # Fallback to last JSON snapshot
        return _read_plan_json(db, s.id)


def _replace_epics_and_stories(db: DBSession, s: Session, epics: List[Dict[str, Any]]):
    """Replace all epics and stories for session with new data."""
    # Simple strategy: delete existing epics/stories for session, then insert
    db.query(Story).filter(
        Story.epic_id.in_(db.query(Epic.id).filter(Epic.session_id == s.id).subquery())
    ).delete(synchronize_session=False)
    db.query(Epic).filter(Epic.session_id == s.id).delete(synchronize_session=False)
    db.flush()

    for epic in epics:
        title = epic.get("epic") or epic.get("title") or ""
        component = epic.get("component")
        description = epic.get("description")
        e = Epic(
            session_id=s.id,
            title=title[:500],
            description=description,
            component_team=component,
            status=EpicStatus.TODO,
            priority=Priority.MEDIUM,
        )
        db.add(e)
        db.flush()

        for st in epic.get("stories") or []:
            st_title = st if isinstance(st, str) else st.get("title", str(st))
            db.add(
                Story(
                    epic_id=e.id,
                    title=st_title[:500],
                    status=StoryStatus.TODO,
                )
            )


def set_jira_plan(
    session_uuid: Optional[str], jira_key: str, plan_json: Any
) -> Tuple[str, Dict[str, Any]]:
    """Save JIRA plan to both normalized tables and JSON snapshot."""
    with _db() as db:
        s = _get_or_create_session(db, session_uuid, jira_key)
        epics = _normalize_plan(plan_json)

        # Persist normalized rows
        _replace_epics_and_stories(db, s, epics)

        # Persist snapshot Output history
        snapshot = json.dumps(plan_json or {}, indent=2)
        out = Output(
            session_id=s.id, stage=Stage.JIRAS, filename="plan.json", content=snapshot
        )
        db.add(out)

        db.commit()
        return str(s.id), plan_json or {}


def patch_jira_plan(
    session_uuid: Optional[str], jira_key: str, patch_ops: Any
) -> Tuple[str, Dict[str, Any]]:
    """Apply JSON patch operations to the JIRA plan."""
    try:
        import jsonpatch  # type: ignore
    except Exception:
        raise RuntimeError("jsonpatch dependency missing; install `jsonpatch`")

    with _db() as db:
        s = _get_or_create_session(db, session_uuid, jira_key)
        current = get_jira_plan(str(s.id), jira_key)
        patched = jsonpatch.apply_patch(current or {}, patch_ops or [])
        # Reuse set_jira_plan to commit normalized + snapshot
        return set_jira_plan(str(s.id), jira_key, patched)
