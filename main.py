#!/usr/bin/env python3
import argparse
import logging
import sys
from pathlib import Path

# Import stage functions
from stages.refine_feature import fetch_jira_issue_with_agent, fill_template


# Setup logging
def setup_logging(debug=False):
    level = logging.DEBUG if debug else logging.WARNING
    logging.basicConfig(
        level=level,
        format="%(levelname)s: %(message)s",
        handlers=[logging.StreamHandler(sys.stderr)],
    )


# Stage implementations
def run_refine_stage(issue_key: str, output_dir: Path, debug: bool = False):
    """Run the refine feature stage."""
    logger = logging.getLogger("refine_feature")

    template_path = Path(__file__).parent / "prompts" / "refine_feature.md"

    if not template_path.exists():
        logger.error(f"Template not found: {template_path}")
        sys.exit(1)

    logger.info(f"Reading template from {template_path}")
    with open(template_path, "r") as f:
        template = f.read()

    logger.info(f"Fetching Jira issue {issue_key}")
    issue = fetch_jira_issue_with_agent(issue_key)

    filled = fill_template(template, issue)

    output_path = output_dir / f"refined_{issue_key}.md"
    logger.info(f"Writing refinement spec to {output_path}")

    with open(output_path, "w") as f:
        f.write(filled)

    print(f"✓ Refinement spec written to {output_path}")
    return output_path


def run_epics_stage(input_file: Path, output_dir: Path, debug: bool = False):
    """Run the create epics stage."""
    logger = logging.getLogger("epics")
    logger.info(f"Creating epics from {input_file}")

    # TODO: Implement epics creation logic
    output_path = output_dir / f"epics_{input_file.stem.replace('refined_', '')}.md"

    logger.warning("Epics stage not yet implemented")
    print(f"✗ Epics stage not yet implemented. Would output to {output_path}")
    return output_path


def run_jiras_stage(input_file: Path, output_dir: Path, debug: bool = False):
    """Run the draft jiras stage."""
    logger = logging.getLogger("jiras")
    logger.info(f"Creating jiras from {input_file}")

    # TODO: Implement jiras creation logic
    output_path = output_dir / f"jiras_{input_file.stem.replace('epics_', '')}.md"

    logger.warning("Jiras stage not yet implemented")
    print(f"✗ Jiras stage not yet implemented. Would output to {output_path}")
    return output_path


def run_estimate_stage(input_file: Path, output_dir: Path, debug: bool = False):
    """Run the estimate stage."""
    logger = logging.getLogger("estimate")
    logger.info(f"Creating estimates from {input_file}")

    # TODO: Implement estimation logic
    output_path = output_dir / f"estimates_{input_file.stem.replace('jiras_', '')}.md"

    logger.warning("Estimate stage not yet implemented")
    print(f"✗ Estimate stage not yet implemented. Would output to {output_path}")
    return output_path


def run_full_pipeline(issue_key: str, output_dir: Path, debug: bool = False):
    """Run the complete pipeline."""
    logger = logging.getLogger("pipeline")
    logger.info(f"Running full pipeline for {issue_key}")

    print(f"🚀 Starting full pipeline for {issue_key}")

    # Stage 1: Refine
    print("📝 Stage 1: Refining feature...")
    refined_output = run_refine_stage(issue_key, output_dir, debug)

    # Stage 2: Epics
    print("📋 Stage 2: Creating epics...")
    epics_output = run_epics_stage(refined_output, output_dir, debug)

    # Stage 3: Jiras
    print("🎫 Stage 3: Drafting jiras...")
    jiras_output = run_jiras_stage(epics_output, output_dir, debug)

    # Stage 4: Estimate
    print("📊 Stage 4: Creating estimates...")
    estimates_output = run_estimate_stage(jiras_output, output_dir, debug)

    print(f"✅ Pipeline complete! Final output: {estimates_output}")


def main():
    parser = argparse.ArgumentParser(
        description="AI Feature Sizing Tool - Transform Jira features into detailed specs, epics, and estimates",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s stage refine PROJ-123
  %(prog)s stage refine PROJ-123 --debug --output-dir ./my-outputs
  %(prog)s run PROJ-123
  %(prog)s run PROJ-123 --debug
        """,
    )

    # Global arguments
    parser.add_argument("--debug", action="store_true", help="Enable debug logging")
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("outputs"),
        help="Output directory (default: outputs)",
    )

    # Subcommands
    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    # Stage subcommand
    stage_parser = subparsers.add_parser("stage", help="Run individual pipeline stages")
    stage_subparsers = stage_parser.add_subparsers(
        dest="stage", help="Available stages"
    )

    # Stage: refine
    refine_parser = stage_subparsers.add_parser(
        "refine", help="Refine a Jira feature into a detailed spec"
    )
    refine_parser.add_argument("issue_key", help="Jira issue key (e.g., PROJ-123)")

    # Stage: epics
    epics_parser = stage_subparsers.add_parser(
        "epics", help="Create epics from refined spec"
    )
    epics_parser.add_argument(
        "input_file", type=Path, help="Input file from refine stage"
    )

    # Stage: jiras
    jiras_parser = stage_subparsers.add_parser("jiras", help="Draft jiras from epics")
    jiras_parser.add_argument(
        "input_file", type=Path, help="Input file from epics stage"
    )

    # Stage: estimate
    estimate_parser = stage_subparsers.add_parser(
        "estimate", help="Create estimates from jiras"
    )
    estimate_parser.add_argument(
        "input_file", type=Path, help="Input file from jiras stage"
    )

    # Run subcommand (full pipeline)
    run_parser = subparsers.add_parser("run", help="Run the complete pipeline")
    run_parser.add_argument("issue_key", help="Jira issue key (e.g., PROJ-123)")

    # Parse arguments
    args = parser.parse_args()

    # Setup logging
    setup_logging(debug=args.debug)

    # Ensure output directory exists
    args.output_dir.mkdir(exist_ok=True)

    # Route to appropriate function
    if args.command == "stage":
        if args.stage == "refine":
            run_refine_stage(args.issue_key, args.output_dir, args.debug)
        elif args.stage == "epics":
            if not args.input_file.exists():
                print(
                    f"Error: Input file not found: {args.input_file}", file=sys.stderr
                )
                sys.exit(1)
            run_epics_stage(args.input_file, args.output_dir, args.debug)
        elif args.stage == "jiras":
            if not args.input_file.exists():
                print(
                    f"Error: Input file not found: {args.input_file}", file=sys.stderr
                )
                sys.exit(1)
            run_jiras_stage(args.input_file, args.output_dir, args.debug)
        elif args.stage == "estimate":
            if not args.input_file.exists():
                print(
                    f"Error: Input file not found: {args.input_file}", file=sys.stderr
                )
                sys.exit(1)
            run_estimate_stage(args.input_file, args.output_dir, args.debug)
        else:
            stage_parser.print_help()
    elif args.command == "run":
        run_full_pipeline(args.issue_key, args.output_dir, args.debug)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
