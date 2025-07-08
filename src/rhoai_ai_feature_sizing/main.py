#!/usr/bin/env python3
import argparse
import logging
import sys
from pathlib import Path
import time

# Import stage functions
from rhoai_ai_feature_sizing.stages.refine_feature import (
    generate_refinement_with_agent,
)
from rhoai_ai_feature_sizing.stages.draft_jiras import (
    draft_jiras_from_file,
)


# Setup logging
def setup_logging(debug=False):
    """Configure comprehensive logging following Llama Stack best practices."""
    level = logging.DEBUG if debug else logging.INFO

    # Create formatter with more detailed information
    formatter = logging.Formatter(
        "%(asctime)s - %(name)s - %(levelname)s - %(funcName)s:%(lineno)d - %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    # Configure root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(level)

    # Clear any existing handlers
    for handler in root_logger.handlers[:]:
        root_logger.removeHandler(handler)

    # Console handler
    console_handler = logging.StreamHandler(sys.stderr)
    console_handler.setLevel(level)
    console_handler.setFormatter(formatter)
    root_logger.addHandler(console_handler)

    # File handler for detailed logs
    if debug:
        file_handler = logging.FileHandler("rhoai_feature_sizing.log")
        file_handler.setLevel(logging.DEBUG)
        file_handler.setFormatter(formatter)
        root_logger.addHandler(file_handler)

    # Set specific logger levels
    logging.getLogger("llama_stack_client").setLevel(
        logging.INFO if debug else logging.WARNING
    )
    logging.getLogger("httpx").setLevel(logging.WARNING)

    if debug:
        logging.info(
            "Debug logging enabled - detailed logs written to rhoai_feature_sizing.log"
        )


# Stage implementations
def run_refine_stage(issue_key: str, output_dir: Path, debug: bool = False):
    """Run the refine feature stage with enhanced error handling and monitoring."""
    logger = logging.getLogger("refine_feature")
    start_time = time.time()

    # Validate inputs
    if not issue_key or not issue_key.strip():
        logger.error("Issue key cannot be empty")
        sys.exit(1)

    template_path = Path(__file__).parent / "prompts" / "refine_feature.md"

    if not template_path.exists():
        logger.error(f"Template not found: {template_path}")
        sys.exit(1)

    logger.info(f"Reading template from {template_path}")
    try:
        with open(template_path, "r", encoding="utf-8") as f:
            template = f.read()
    except Exception as e:
        logger.error(f"Failed to read template: {e}")
        sys.exit(1)

    logger.info(f"Generating refinement document for Jira issue {issue_key}")
    try:
        refinement_content = generate_refinement_with_agent(issue_key, template)
    except Exception as e:
        logger.error(f"Failed to generate refinement document: {e}")
        if debug:
            logger.exception("Full traceback:")
        sys.exit(1)

    output_path = output_dir / f"refined_{issue_key}.md"
    logger.info(f"Writing refinement spec to {output_path}")

    try:
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(refinement_content)
    except Exception as e:
        logger.error(f"Failed to write output file: {e}")
        sys.exit(1)

    # Log performance metrics
    duration = time.time() - start_time
    logger.info(f"Refinement stage completed in {duration:.2f}s")
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


def run_jiras_stage(
    input_file: Path, output_dir: Path, debug: bool = False, soft_mode: bool = True
):
    """Run the draft jiras stage with enhanced error handling and monitoring."""
    logger = logging.getLogger("jiras")
    start_time = time.time()

    # Validate inputs
    if not input_file.exists():
        logger.error(f"Input file not found: {input_file}")
        sys.exit(1)

    logger.info(
        f"Generating Jira tickets structure from {input_file} (soft_mode: {soft_mode})"
    )

    try:
        jira_content = draft_jiras_from_file(input_file, soft_mode=soft_mode)
    except Exception as e:
        logger.error(f"Failed to generate Jira tickets structure: {e}")
        if debug:
            logger.exception("Full traceback:")
        sys.exit(1)

    # Determine output filename based on input type
    if input_file.stem.startswith("epics_"):
        issue_key = input_file.stem.replace("epics_", "")
    elif input_file.stem.startswith("refined_"):
        issue_key = input_file.stem.replace("refined_", "")
    else:
        issue_key = input_file.stem

    output_path = output_dir / f"jiras_{issue_key}.md"
    logger.info(f"Writing Jira tickets structure to {output_path}")

    try:
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(jira_content)
    except Exception as e:
        logger.error(f"Failed to write output file: {e}")
        sys.exit(1)

    # Log performance metrics
    duration = time.time() - start_time
    mode_text = "soft mode" if soft_mode else "hard mode"
    logger.info(f"Jira tickets stage completed in {duration:.2f}s ({mode_text})")
    print(f"✓ Jira tickets structure written to {output_path} ({mode_text})")
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


def run_full_pipeline(
    issue_key: str, output_dir: Path, debug: bool = False, soft_mode: bool = True
):
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

    # Stage 3: Jiras (use refined output if epics stage isn't implemented)
    print("🎫 Stage 3: Drafting jiras...")
    # For now, use refined output since epics stage isn't implemented yet
    if not epics_output.exists():
        logger.info("Epics stage not implemented, using refined output for jiras stage")
        jiras_input = refined_output
    else:
        jiras_input = epics_output

    jiras_output = run_jiras_stage(jiras_input, output_dir, debug, soft_mode)

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
    jiras_parser.add_argument(
        "--soft-mode",
        action="store_true",
        default=True,
        help="Generate ticket structure without creating actual Jira tickets (default: True)",
    )
    jiras_parser.add_argument(
        "--hard-mode",
        action="store_true",
        help="Create actual Jira tickets (overrides --soft-mode)",
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
    run_parser.add_argument(
        "--soft-mode",
        action="store_true",
        default=True,
        help="Generate ticket structure without creating actual Jira tickets (default: True)",
    )
    run_parser.add_argument(
        "--hard-mode",
        action="store_true",
        help="Create actual Jira tickets (overrides --soft-mode)",
    )

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
            # Determine soft_mode: hard_mode flag overrides soft_mode
            soft_mode = (
                not args.hard_mode if hasattr(args, "hard_mode") else args.soft_mode
            )
            run_jiras_stage(args.input_file, args.output_dir, args.debug, soft_mode)
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
        # Determine soft_mode: hard_mode flag overrides soft_mode
        soft_mode = not args.hard_mode if hasattr(args, "hard_mode") else args.soft_mode
        run_full_pipeline(args.issue_key, args.output_dir, args.debug, soft_mode)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
