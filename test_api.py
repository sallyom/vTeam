#!/usr/bin/env python3
"""Simple test script for the RHOAI AI Feature Sizing API."""
import asyncio
import time
import requests
import json
from typing import Dict, Any


class APITester:
    """Test the API endpoints."""

    def __init__(self, base_url: str = "http://localhost:8000"):
        self.base_url = base_url.rstrip("/")
        self.session_id = None

    def test_health_check(self) -> bool:
        """Test the health check endpoint."""
        print("🩺 Testing health check...")
        try:
            response = requests.get(f"{self.base_url}/healthz")
            response.raise_for_status()
            health = response.json()

            print(f"   ✅ Health check passed")
            print(f"   📊 Database: {health.get('database', 'unknown')}")
            print(f"   🤖 Llama Stack: {health.get('llama_stack', 'unknown')}")
            return True
        except Exception as e:
            print(f"   ❌ Health check failed: {e}")
            return False

    def test_create_session(self, jira_key: str = "TEST-123") -> bool:
        """Test creating a new session."""
        print(f"🚀 Creating session for {jira_key}...")
        try:
            payload = {"jira_key": jira_key, "soft_mode": True}
            response = requests.post(
                f"{self.base_url}/sessions",
                json=payload,
                headers={"Content-Type": "application/json"},
            )
            response.raise_for_status()
            session = response.json()

            self.session_id = session["id"]
            print(f"   ✅ Session created: {self.session_id}")
            print(f"   📋 Status: {session['status']}")
            print(f"   🎯 Jira Key: {session['jira_key']}")
            print(f"   🔧 Soft Mode: {session['soft_mode']}")
            return True
        except Exception as e:
            print(f"   ❌ Session creation failed: {e}")
            return False

    def test_list_sessions(self) -> bool:
        """Test listing sessions."""
        print("📋 Testing session list...")
        try:
            response = requests.get(f"{self.base_url}/sessions?page=1&page_size=10")
            response.raise_for_status()
            data = response.json()

            print(f"   ✅ Found {data['total']} sessions (page {data['page']})")
            if data["sessions"]:
                print(f"   📊 Latest session: {data['sessions'][0]['jira_key']}")
            return True
        except Exception as e:
            print(f"   ❌ Session list failed: {e}")
            return False

    def test_session_progress(self) -> bool:
        """Test session progress endpoint."""
        if not self.session_id:
            print("   ⚠️  No session ID available for progress test")
            return False

        print("📈 Testing session progress...")
        try:
            response = requests.get(
                f"{self.base_url}/sessions/{self.session_id}/progress"
            )
            response.raise_for_status()
            progress = response.json()

            print(f"   ✅ Progress: {progress['progress_percentage']}%")
            print(f"   📊 Status: {progress['status']}")
            print(f"   🎭 Stage: {progress.get('current_stage', 'None')}")
            if progress.get("latest_message"):
                print(f"   💬 Latest: {progress['latest_message'][:100]}...")
            return True
        except Exception as e:
            print(f"   ❌ Progress check failed: {e}")
            return False

    def test_session_messages(self) -> bool:
        """Test session messages endpoint."""
        if not self.session_id:
            print("   ⚠️  No session ID available for messages test")
            return False

        print("💬 Testing session messages...")
        try:
            response = requests.get(
                f"{self.base_url}/sessions/{self.session_id}/messages?limit=10"
            )
            response.raise_for_status()
            messages = response.json()

            print(f"   ✅ Found {len(messages)} messages")
            if messages:
                latest = messages[-1]
                print(f"   📝 Latest: [{latest['role']}] {latest['content'][:100]}...")
            return True
        except Exception as e:
            print(f"   ❌ Messages test failed: {e}")
            return False

    def test_session_outputs(self) -> bool:
        """Test session outputs endpoint."""
        if not self.session_id:
            print("   ⚠️  No session ID available for outputs test")
            return False

        print("📄 Testing session outputs...")
        try:
            response = requests.get(
                f"{self.base_url}/sessions/{self.session_id}/outputs"
            )
            response.raise_for_status()
            outputs = response.json()

            print(f"   ✅ Found {len(outputs)} outputs")
            for output in outputs:
                print(
                    f"   📋 {output['stage']}: {output['filename']} ({len(output['content'])} chars)"
                )
            return True
        except Exception as e:
            print(f"   ❌ Outputs test failed: {e}")
            return False

    def test_session_detail(self) -> bool:
        """Test session detail endpoint."""
        if not self.session_id:
            print("   ⚠️  No session ID available for detail test")
            return False

        print("🔍 Testing session detail...")
        try:
            response = requests.get(f"{self.base_url}/sessions/{self.session_id}")
            response.raise_for_status()
            session = response.json()

            print(f"   ✅ Session detail retrieved")
            print(f"   📊 Status: {session['status']}")
            print(f"   💬 Messages: {len(session.get('messages', []))}")
            print(f"   📄 Outputs: {len(session.get('outputs', []))}")
            print(f"   🔧 MCP Usage: {len(session.get('mcp_usages', []))}")
            return True
        except Exception as e:
            print(f"   ❌ Session detail failed: {e}")
            return False

    def poll_until_complete(self, max_wait: int = 300) -> bool:
        """Poll session until completion or timeout."""
        if not self.session_id:
            print("   ⚠️  No session ID available for polling")
            return False

        print(f"⏳ Polling session for up to {max_wait} seconds...")
        start_time = time.time()

        while time.time() - start_time < max_wait:
            try:
                response = requests.get(
                    f"{self.base_url}/sessions/{self.session_id}/progress"
                )
                response.raise_for_status()
                progress = response.json()

                status = progress["status"]
                percentage = progress["progress_percentage"]
                stage = progress.get("current_stage", "unknown")

                print(f"   📈 {percentage}% - {status} ({stage})")

                if status in ["completed", "failed"]:
                    if status == "completed":
                        print(f"   ✅ Session completed successfully!")
                        return True
                    else:
                        print(
                            f"   ❌ Session failed: {progress.get('error_message', 'Unknown error')}"
                        )
                        return False

                time.sleep(5)  # Poll every 5 seconds

            except Exception as e:
                print(f"   ⚠️  Polling error: {e}")
                time.sleep(5)

        print(f"   ⏰ Timeout after {max_wait} seconds")
        return False

    def run_all_tests(
        self, jira_key: str = "TEST-123", wait_for_completion: bool = False
    ) -> bool:
        """Run all API tests."""
        print("🧪 Running RHOAI AI Feature Sizing API Tests")
        print("=" * 50)

        tests = [
            self.test_health_check,
            self.test_list_sessions,
            lambda: self.test_create_session(jira_key),
            self.test_session_progress,
            self.test_session_messages,
            self.test_session_outputs,
            self.test_session_detail,
        ]

        passed = 0
        total = len(tests)

        for test in tests:
            result = test()
            if result:
                passed += 1
            print()

        if wait_for_completion and self.session_id:
            print("⏳ Waiting for session completion...")
            self.poll_until_complete()
            print()

            # Test outputs again after completion
            print("📄 Testing outputs after completion...")
            self.test_session_outputs()
            print()

        print("=" * 50)
        print(f"🧪 Test Results: {passed}/{total} passed")

        if passed == total:
            print("✅ All tests passed!")
            return True
        else:
            print("❌ Some tests failed!")
            return False


def main():
    """Main test function."""
    import argparse

    parser = argparse.ArgumentParser(description="Test the RHOAI AI Feature Sizing API")
    parser.add_argument("--url", default="http://localhost:8000", help="API base URL")
    parser.add_argument("--jira-key", default="TEST-123", help="Jira key to test with")
    parser.add_argument(
        "--wait", action="store_true", help="Wait for session completion"
    )

    args = parser.parse_args()

    tester = APITester(args.url)
    success = tester.run_all_tests(args.jira_key, args.wait)

    exit(0 if success else 1)


if __name__ == "__main__":
    main()
