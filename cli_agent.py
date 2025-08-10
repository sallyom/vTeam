#!/usr/bin/env python3
"""CLI interface for the autonomous RHOAI Feature Sizing Agent."""

import os
import sys
import json
import asyncio
import argparse
import logging
from pathlib import Path
from datetime import datetime
from typing import Optional, List
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Suppress noisy HTTP logs
logging.getLogger("httpx").setLevel(logging.WARNING)

# Add the src directory to Python path
src_path = Path(__file__).parent / "src"
sys.path.insert(0, str(src_path))

try:
    from rhoai_ai_feature_sizing.unified_agent import UnifiedFeatureSizingAgent
    from rhoai_ai_feature_sizing.api.rag_service import RAGService
    from rhoai_ai_feature_sizing.tools.planning_store_db import (
        get_refinement,
        get_jira_plan,
    )
except ImportError as e:
    print(f"❌ Import error: {e}")
    print(
        "Make sure you're running from the project root and dependencies are installed."
    )
    sys.exit(1)


class FeaturePlanningCLI:
    """CLI interface for autonomous feature planning."""

    def __init__(self):
        self.agent = None
        self.rag_service = None

    async def initialize(self):
        """Initialize the agent and services."""
        print("🔧 Initializing services...")

        # Check required environment variables
        if not os.getenv("INFERENCE_MODEL"):
            print("❌ INFERENCE_MODEL environment variable is required.")
            print(
                "   Example: export INFERENCE_MODEL='meta-llama/Llama-3.2-3B-Instruct'"
            )
            return False

        try:
            # Initialize RAG service
            self.rag_service = RAGService()

            # Initialize unified agent
            self.agent = UnifiedFeatureSizingAgent()

            print("✅ Services initialized successfully")
            return True

        except Exception as e:
            print(f"❌ Failed to initialize services: {e}")
            return False

    async def plan_feature(
        self,
        jira_key: str,
        rag_stores: Optional[List[str]] = None,
        max_turns: int = 12,
        validation: bool = True,
        output_dir: Optional[str] = None,
    ):
        """Run autonomous feature planning for a JIRA issue."""
        print(f"🚀 Starting autonomous planning for {jira_key}")
        print(f"   Max turns: {max_turns}")
        print(f"   Validation: {'enabled' if validation else 'disabled'}")
        print(f"   RAG stores: {rag_stores or 'default'}")
        print()

        try:
            # Generate session ID
            session_id = f"cli-{datetime.now().strftime('%Y%m%d-%H%M%S')}"

            # Run the planning loop
            print("🤖 Agent is analyzing the JIRA issue and creating the plan...")
            print("   (This may take several minutes)")
            print()

            results = await self.agent.run_planning_loop(
                session_id=session_id,
                jira_key=jira_key,
                rag_store_ids=rag_stores,
                max_turns=max_turns,
                enable_validation=validation,
            )

            # Display results
            print("=" * 60)
            print("🎉 PLANNING COMPLETED!")
            print("=" * 60)
            print()

            # Show refinement document
            refinement = results.get("refinement_content", "")
            if refinement:
                print("📋 REFINEMENT DOCUMENT:")
                print("-" * 40)
                print(refinement)
                print()
            else:
                print("⚠️  No refinement document generated")

            # Show JIRA structure
            jira_structure = results.get("jira_structure", {})
            if jira_structure:
                print("🎯 JIRA PLAN:")
                print("-" * 40)
                if isinstance(jira_structure, list):
                    for i, epic in enumerate(jira_structure, 1):
                        epic_title = epic.get("epic", "Unknown Epic")
                        component = epic.get("component", "Unknown")
                        stories = epic.get("stories", [])

                        print(f"{i}. Epic: {epic_title}")
                        print(f"   Component: {component}")
                        print(f"   Stories ({len(stories)}):")
                        for j, story in enumerate(stories, 1):
                            print(f"     {j}. {story}")
                        print()
                else:
                    print(json.dumps(jira_structure, indent=2))
                print()
            else:
                print("⚠️  No JIRA structure generated")

            # Show validation notes
            validation_notes = results.get("validation_notes", "")
            if validation_notes:
                print("✅ VALIDATION NOTES:")
                print("-" * 40)
                print(validation_notes)
                print()

            # Show actions taken
            actions = results.get("actions_taken", [])
            print(f"🔧 Actions taken: {', '.join(actions) if actions else 'none'}")
            print()

            # Save outputs if requested
            if output_dir:
                await self._save_outputs(output_dir, session_id, jira_key, results)

            # Show database retrieval info
            print("💾 DATABASE STATE:")
            print("-" * 40)
            try:
                db_refinement = get_refinement(session_id, jira_key)
                db_plan = get_jira_plan(session_id, jira_key)

                print(f"Refinement in DB: {'✅' if db_refinement else '❌'}")
                print(f"JIRA plan in DB: {'✅' if db_plan else '❌'}")

                if db_plan:
                    epic_count = len(db_plan) if isinstance(db_plan, list) else 0
                    total_stories = (
                        sum(len(epic.get("stories", [])) for epic in db_plan)
                        if isinstance(db_plan, list)
                        else 0
                    )
                    print(f"Epics: {epic_count}, Stories: {total_stories}")

            except Exception as e:
                print(f"Could not retrieve DB state: {e}")

            print()
            print("✨ Planning completed successfully!")
            return True

        except Exception as e:
            print(f"❌ Planning failed: {e}")
            return False

    async def _save_outputs(
        self, output_dir: str, session_id: str, jira_key: str, results: dict
    ):
        """Save outputs to files."""
        try:
            output_path = Path(output_dir)
            output_path.mkdir(parents=True, exist_ok=True)

            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

            # Save refinement document
            refinement = results.get("refinement_content", "")
            if refinement:
                refinement_file = output_path / f"{jira_key}_refinement_{timestamp}.md"
                with open(refinement_file, "w", encoding="utf-8") as f:
                    f.write(refinement)
                print(f"💾 Saved refinement to: {refinement_file}")

            # Save JIRA structure
            jira_structure = results.get("jira_structure", {})
            if jira_structure:
                jira_file = output_path / f"{jira_key}_jira_plan_{timestamp}.json"
                with open(jira_file, "w", encoding="utf-8") as f:
                    json.dump(jira_structure, f, indent=2)
                print(f"💾 Saved JIRA plan to: {jira_file}")

            # Save full results
            results_file = output_path / f"{jira_key}_full_results_{timestamp}.json"
            with open(results_file, "w", encoding="utf-8") as f:
                # Make results JSON serializable
                serializable_results = {
                    "session_id": session_id,
                    "jira_key": jira_key,
                    "timestamp": timestamp,
                    "refinement_content": results.get("refinement_content", ""),
                    "jira_structure": results.get("jira_structure", {}),
                    "validation_notes": results.get("validation_notes", ""),
                    "actions_taken": results.get("actions_taken", []),
                }
                json.dump(serializable_results, f, indent=2)
            print(f"💾 Saved full results to: {results_file}")

        except Exception as e:
            print(f"⚠️  Failed to save outputs: {e}")

    async def chat_with_agent(
        self, session_id: str, jira_key: str, rag_stores: Optional[List[str]] = None
    ):
        """Interactive chat with the agent."""
        print(f"💬 Starting chat session for {jira_key}")
        print("   Type 'quit' or 'exit' to end the session")
        print("   Type 'help' for available commands")
        print()

        # Get current state from database
        try:
            current_state = {
                "jira_key": jira_key,
                "refinement_content": get_refinement(session_id, jira_key),
                "jira_structure": get_jira_plan(session_id, jira_key),
            }
            print(f"📋 Loaded existing state for session {session_id}")
        except Exception as e:
            print(f"⚠️  Could not load existing state: {e}")
            current_state = {"jira_key": jira_key}

        while True:
            try:
                user_input = input("\n🤔 You: ").strip()

                if user_input.lower() in ["quit", "exit"]:
                    print("👋 Goodbye!")
                    break

                if user_input.lower() == "help":
                    print(
                        """
Available commands:
  help          - Show this help message
  status        - Show current session state
  refinement    - Show current refinement document
  jira          - Show current JIRA plan
  quit/exit     - End the chat session
  
Or just type your message to chat with the agent.
                    """
                    )
                    continue

                if user_input.lower() == "status":
                    has_refinement = bool(current_state.get("refinement_content"))
                    has_jira = bool(current_state.get("jira_structure"))
                    print(f"📊 Session: {session_id}")
                    print(f"📋 JIRA Key: {jira_key}")
                    print(f"📄 Refinement: {'✅' if has_refinement else '❌'}")
                    print(f"🎯 JIRA Plan: {'✅' if has_jira else '❌'}")
                    continue

                if user_input.lower() == "refinement":
                    refinement = current_state.get("refinement_content", "")
                    if refinement:
                        print("\n📋 CURRENT REFINEMENT:")
                        print("-" * 40)
                        print(refinement)
                    else:
                        print("❌ No refinement document available")
                    continue

                if user_input.lower() == "jira":
                    jira_plan = current_state.get("jira_structure", {})
                    if jira_plan:
                        print("\n🎯 CURRENT JIRA PLAN:")
                        print("-" * 40)
                        print(json.dumps(jira_plan, indent=2))
                    else:
                        print("❌ No JIRA plan available")
                    continue

                if not user_input:
                    continue

                print("\n🤖 Agent is thinking...")

                # Send message to agent
                response, actions_taken, updated_state = await self.agent.chat(
                    session_id=session_id,
                    user_message=user_input,
                    current_state=current_state,
                    rag_store_ids=rag_stores,
                )

                print(f"\n🤖 Agent: {response}")

                if actions_taken:
                    print(f"🔧 Actions taken: {', '.join(actions_taken)}")

                # Update current state
                current_state.update(updated_state)

            except KeyboardInterrupt:
                print("\n👋 Chat interrupted. Goodbye!")
                break
            except Exception as e:
                print(f"❌ Error in chat: {e}")

    def list_rag_stores(self):
        """List available RAG stores."""
        print("📚 Available RAG stores:")
        default_stores = ["patternfly_docs", "rhoai_docs", "kubernetes_docs"]
        for store in default_stores:
            print(f"  - {store}")


async def main():
    """Main CLI function."""
    parser = argparse.ArgumentParser(
        description="Autonomous RHOAI Feature Sizing Agent CLI",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Plan a feature with default settings
  python cli_agent.py plan RHOAIENG-12345

  # Plan with specific RAG stores and custom settings
  python cli_agent.py plan RHOAIENG-12345 --rag-stores rhoai_docs patternfly_docs --max-turns 15

  # Save outputs to a directory
  python cli_agent.py plan RHOAIENG-12345 --output-dir ./outputs

  # Interactive chat with the agent
  python cli_agent.py chat RHOAIENG-12345 --session-id cli-20241201-143022

  # List available RAG stores
  python cli_agent.py list-stores
        """,
    )

    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    # Plan command
    plan_parser = subparsers.add_parser("plan", help="Run autonomous feature planning")
    plan_parser.add_argument("jira_key", help="JIRA issue key (e.g., RHOAIENG-12345)")
    plan_parser.add_argument(
        "--rag-stores", nargs="*", help="RAG stores to use for context"
    )
    plan_parser.add_argument(
        "--max-turns", type=int, default=12, help="Maximum agent turns"
    )
    plan_parser.add_argument(
        "--no-validation", action="store_true", help="Disable validation"
    )
    plan_parser.add_argument("--output-dir", help="Directory to save outputs")

    # Chat command
    chat_parser = subparsers.add_parser("chat", help="Interactive chat with the agent")
    chat_parser.add_argument("jira_key", help="JIRA issue key")
    chat_parser.add_argument("--session-id", help="Existing session ID to continue")
    chat_parser.add_argument("--rag-stores", nargs="*", help="RAG stores to use")

    # List stores command
    subparsers.add_parser("list-stores", help="List available RAG stores")

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        return

    # Initialize CLI
    cli = FeaturePlanningCLI()

    if args.command == "list-stores":
        cli.list_rag_stores()
        return

    # Initialize services for other commands
    if not await cli.initialize():
        sys.exit(1)

    if args.command == "plan":
        success = await cli.plan_feature(
            jira_key=args.jira_key,
            rag_stores=args.rag_stores,
            max_turns=args.max_turns,
            validation=not args.no_validation,
            output_dir=args.output_dir,
        )
        sys.exit(0 if success else 1)

    elif args.command == "chat":
        session_id = (
            args.session_id or f"cli-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
        )
        await cli.chat_with_agent(
            session_id=session_id, jira_key=args.jira_key, rag_stores=args.rag_stores
        )


if __name__ == "__main__":
    asyncio.run(main())
