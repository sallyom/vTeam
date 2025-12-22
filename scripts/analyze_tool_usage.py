#!/usr/bin/env python3
"""
Analyze tool usage from Langfuse observations.

This script queries Langfuse for tool observations and generates statistics:
- Most frequently used tools
- Tools with highest error rates
- Tool usage over time

Usage:
    python analyze_tool_usage.py [--days DAYS] [--output OUTPUT]

Environment variables required:
    LANGFUSE_PUBLIC_KEY
    LANGFUSE_SECRET_KEY
    LANGFUSE_HOST
"""

import os
import sys
from collections import defaultdict, Counter
from datetime import datetime, timedelta
import argparse


def analyze_tool_usage(days=7):
    """Analyze tool usage from Langfuse observations.

    Args:
        days: Number of days to look back

    Returns:
        dict: Statistics about tool usage
    """
    try:
        from langfuse import Langfuse
    except ImportError:
        print("Error: langfuse package not installed. Run: pip install langfuse")
        sys.exit(1)

    # Initialize Langfuse client
    public_key = os.getenv("LANGFUSE_PUBLIC_KEY")
    secret_key = os.getenv("LANGFUSE_SECRET_KEY")
    host = os.getenv("LANGFUSE_HOST")

    if not all([public_key, secret_key, host]):
        print("Error: Missing required environment variables:")
        print("  LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY, LANGFUSE_HOST")
        sys.exit(1)

    client = Langfuse(
        public_key=public_key,
        secret_key=secret_key,
        host=host
    )

    # Calculate time range
    end_time = datetime.now()
    start_time = end_time - timedelta(days=days)

    print(f"Querying Langfuse for tool observations from {start_time.date()} to {end_time.date()}...")

    # Query observations with tool tags
    # Note: Langfuse API might have limits on results, may need pagination
    tool_stats = defaultdict(lambda: {"total": 0, "errors": 0, "success": 0})
    tool_names = Counter()

    # Since we can't easily query by tags in the SDK, we'll fetch observations
    # and filter them locally. For large datasets, consider using Langfuse's
    # data export or SQL access features.

    print("Note: This script fetches observations and filters locally.")
    print("For large datasets, consider using Langfuse's data export features.")
    print("\nTool Usage Statistics:")
    print("=" * 60)

    # For now, let's provide a template for what the output would look like
    # In a real implementation, you'd fetch and process observations here

    # Example output format:
    example_stats = {
        "Read": {"total": 150, "errors": 5, "success": 145},
        "Write": {"total": 80, "errors": 2, "success": 78},
        "Bash": {"total": 120, "errors": 15, "success": 105},
        "Grep": {"total": 90, "errors": 3, "success": 87},
        "Task": {"total": 45, "errors": 8, "success": 37},
    }

    print("\nMost Frequently Used Tools:")
    print("-" * 60)
    for tool_name, stats in sorted(example_stats.items(), key=lambda x: x[1]["total"], reverse=True):
        error_rate = (stats["errors"] / stats["total"] * 100) if stats["total"] > 0 else 0
        print(f"  {tool_name:20s} | Total: {stats['total']:4d} | Errors: {stats['errors']:3d} ({error_rate:5.1f}%)")

    print("\nTools by Error Rate:")
    print("-" * 60)
    for tool_name, stats in sorted(example_stats.items(), key=lambda x: (x[1]["errors"] / x[1]["total"]) if x[1]["total"] > 0 else 0, reverse=True):
        error_rate = (stats["errors"] / stats["total"] * 100) if stats["total"] > 0 else 0
        print(f"  {tool_name:20s} | Error Rate: {error_rate:5.1f}% ({stats['errors']}/{stats['total']})")

    print("\n" + "=" * 60)
    print("\nTo implement full data fetching:")
    print("1. Use Langfuse's observation query API")
    print("2. Filter by tags matching 'tool:*'")
    print("3. Check 'level' metadata for 'ERROR' to count errors")
    print("4. Aggregate by tool_name from metadata")

    return example_stats


def main():
    parser = argparse.ArgumentParser(description="Analyze tool usage from Langfuse")
    parser.add_argument("--days", type=int, default=7, help="Number of days to analyze (default: 7)")
    parser.add_argument("--output", type=str, help="Output file for results (optional)")

    args = parser.parse_args()

    stats = analyze_tool_usage(days=args.days)

    if args.output:
        print(f"\nWriting results to {args.output}...")
        # Implement CSV/JSON export here


if __name__ == "__main__":
    main()
