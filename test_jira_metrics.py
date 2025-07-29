#!/usr/bin/env python3
"""
Test script for the JIRA metrics endpoint.
"""

import requests
import json
import sys
from typing import Dict, Any


def test_jira_metrics_endpoint():
    """Test the JIRA metrics endpoint with a sample JIRA key."""

    # Configuration
    BASE_URL = "http://localhost:8000"  # Adjust if running on different port
    ENDPOINT = f"{BASE_URL}/jira/metrics"

    # Test data - replace with an actual JIRA key from your system
    test_jira_key = "PROJ-123"  # Replace with a real JIRA key

    if len(sys.argv) > 1:
        test_jira_key = sys.argv[1]

    print(f"🧪 Testing JIRA metrics endpoint with key: {test_jira_key}")
    print(f"📡 Endpoint: {ENDPOINT}")
    print("-" * 50)

    # Prepare request
    payload = {"jira_key": test_jira_key}

    headers = {"Content-Type": "application/json"}

    try:
        # Make the request
        print("📤 Sending request...")
        response = requests.post(ENDPOINT, json=payload, headers=headers, timeout=60)

        print(f"📡 Status Code: {response.status_code}")

        if response.status_code == 200:
            # Parse and display results
            result = response.json()
            print("✅ Success! Results:")
            print_results(result)

        elif response.status_code == 500:
            print("❌ Server error:")
            try:
                error_detail = response.json()
                print(json.dumps(error_detail, indent=2))
            except:
                print(response.text)

        elif response.status_code == 422:
            print("❌ Validation error:")
            try:
                error_detail = response.json()
                print(json.dumps(error_detail, indent=2))
            except:
                print(response.text)

        else:
            print(f"❌ Unexpected status code: {response.status_code}")
            print(response.text)

    except requests.exceptions.ConnectionError:
        print(
            "❌ Connection error - make sure the API server is running on localhost:8000"
        )
    except requests.exceptions.Timeout:
        print("❌ Request timeout - the operation took longer than 60 seconds")
    except Exception as e:
        print(f"❌ Unexpected error: {e}")


def print_results(result: Dict[str, Any]):
    """Pretty print the results from the API."""

    print("\n📊 JIRA METRICS RESULTS")
    print("=" * 50)

    # Overall totals
    print(f"📈 Total Story Points: {result.get('total_story_points', 0)}")
    print(f"⏱️  Total Days to Done: {result.get('total_days_to_done', 0.0)}")
    print(f"📋 Processed Issues: {result.get('processed_issues', 0)}")
    print(f"✅ Done Issues: {result.get('done_issues', 0)}")

    # Component breakdown
    components = result.get("components", {})
    if components:
        print(f"\n🏗️  COMPONENT BREAKDOWN ({len(components)} components)")
        print("-" * 30)

        for component_name, metrics in components.items():
            print(f"\n📦 {component_name}:")
            print(f"   Story Points: {metrics.get('total_story_points', 0)}")
            print(f"   Days to Done: {metrics.get('total_days_to_done', 0.0)}")
    else:
        print(
            "\n🏗️  No components found (all issues may be unassigned or have no 'Done' resolution)"
        )

    print("\n" + "=" * 50)


if __name__ == "__main__":
    test_jira_metrics_endpoint()
