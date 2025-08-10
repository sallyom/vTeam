#!/usr/bin/env python3
"""Test script for the simplified RHOAI AI Feature Sizing API."""

import requests
import json
import time
import argparse
from typing import Dict, Any


class SimpleAPITester:
    """Test the simplified API endpoints."""

    def __init__(self, base_url: str = "http://localhost:8001"):
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
            print(f"   📊 Status: {health.get('status', 'unknown')}")
            print(f"   🤖 Services: {health.get('services', {})}")
            return True
        except Exception as e:
            print(f"   ❌ Health check failed: {e}")
            return False

    def test_list_rag_stores(self) -> bool:
        """Test listing RAG stores."""
        print("📚 Testing RAG stores list...")
        try:
            response = requests.get(f"{self.base_url}/rag/stores")
            response.raise_for_status()
            stores = response.json()

            print(f"   ✅ Found {stores.get('total', 0)} RAG stores")
            for store in stores.get("stores", [])[:3]:  # Show first 3
                print(
                    f"   📖 {store.get('name')} ({store.get('document_count', 0)} docs)"
                )
            return True
        except Exception as e:
            print(f"   ❌ RAG stores test failed: {e}")
            return False

    def test_create_session(self, jira_key: str) -> bool:
        """Test creating a session."""
        print(f"🎫 Testing session creation with {jira_key}...")
        try:
            payload = {
                "jira_key": jira_key,
                "rag_store_ids": ["patternfly_docs", "rhoai_docs"],
            }

            response = requests.post(f"{self.base_url}/sessions", json=payload)
            response.raise_for_status()
            session = response.json()

            self.session_id = session["id"]
            print(f"   ✅ Session created: {self.session_id}")
            print(f"   📊 Status: {session.get('status', 'unknown')}")
            return True
        except Exception as e:
            print(f"   ❌ Session creation failed: {e}")
            return False

    def test_session_progress(self, max_wait: int = 60) -> bool:
        """Test session progress monitoring."""
        if not self.session_id:
            print("   ❌ No session ID available")
            return False

        print(f"⏳ Monitoring session progress (max {max_wait}s)...")
        start_time = time.time()

        while time.time() - start_time < max_wait:
            try:
                response = requests.get(f"{self.base_url}/sessions/{self.session_id}")
                response.raise_for_status()
                session = response.json()

                status = session.get("status", "unknown")
                progress_msg = session.get("progress_message", "")

                print(f"   📊 Status: {status} - {progress_msg}")

                if status == "ready":
                    print("   ✅ Session processing completed!")
                    return True
                elif status == "error":
                    print(
                        f"   ❌ Session failed: {session.get('error_message', 'Unknown error')}"
                    )
                    return False

                time.sleep(3)
            except Exception as e:
                print(f"   ❌ Progress check failed: {e}")
                return False

        print(f"   ⏰ Timeout after {max_wait}s")
        return False

    def test_chat_interaction(self) -> bool:
        """Test chat interaction."""
        if not self.session_id:
            print("   ❌ No session ID available")
            return False

        print("💬 Testing chat interaction...")
        try:
            payload = {"message": "Can you provide a summary of what was generated?"}

            response = requests.post(
                f"{self.base_url}/sessions/{self.session_id}/chat", json=payload
            )
            response.raise_for_status()
            chat_response = response.json()

            print(f"   ✅ Chat response received")
            print(f"   🤖 Agent: {chat_response.get('agent_response', '')[:100]}...")
            print(f"   🎬 Actions: {chat_response.get('actions_taken', [])}")
            return True
        except Exception as e:
            print(f"   ❌ Chat interaction failed: {e}")
            return False

    def test_get_refinement(self) -> bool:
        """Test getting refinement document."""
        if not self.session_id:
            print("   ❌ No session ID available")
            return False

        print("📝 Testing refinement document retrieval...")
        try:
            response = requests.get(
                f"{self.base_url}/sessions/{self.session_id}/refinement"
            )

            if response.status_code == 404:
                print("   ⚠️  No refinement document available yet")
                return True

            response.raise_for_status()
            refinement = response.json()

            print(f"   ✅ Refinement document retrieved")
            print(f"   📊 Word count: {refinement.get('word_count', 0)}")
            print(f"   📅 Last updated: {refinement.get('last_updated', 'unknown')}")
            return True
        except Exception as e:
            print(f"   ❌ Refinement retrieval failed: {e}")
            return False

    def test_get_jira_structure(self) -> bool:
        """Test getting JIRA structure."""
        if not self.session_id:
            print("   ❌ No session ID available")
            return False

        print("🎫 Testing JIRA structure retrieval...")
        try:
            response = requests.get(f"{self.base_url}/sessions/{self.session_id}/jiras")

            if response.status_code == 404:
                print("   ⚠️  No JIRA structure available yet")
                return True

            response.raise_for_status()
            jira_structure = response.json()

            print(f"   ✅ JIRA structure retrieved")
            print(f"   📊 Epics: {jira_structure.get('epic_count', 0)}")
            print(f"   📊 Stories: {jira_structure.get('story_count', 0)}")
            return True
        except Exception as e:
            print(f"   ❌ JIRA structure retrieval failed: {e}")
            return False

    def run_full_test(self, jira_key: str, wait_for_completion: bool = False) -> bool:
        """Run all tests."""
        print(f"🚀 Starting full test suite for simplified API")
        print(f"   Base URL: {self.base_url}")
        print(f"   JIRA Key: {jira_key}")
        print()

        tests = [
            ("Health Check", self.test_health_check),
            ("RAG Stores", self.test_list_rag_stores),
            ("Session Creation", lambda: self.test_create_session(jira_key)),
        ]

        if wait_for_completion:
            tests.append(("Session Progress", lambda: self.test_session_progress(120)))
            tests.append(("Chat Interaction", self.test_chat_interaction))
            tests.append(("Refinement Document", self.test_get_refinement))
            tests.append(("JIRA Structure", self.test_get_jira_structure))

        passed = 0
        total = len(tests)

        for test_name, test_func in tests:
            print(f"Running: {test_name}")
            try:
                if test_func():
                    passed += 1
                print()
            except Exception as e:
                print(f"   ❌ Test failed with exception: {e}")
                print()

        print(f"🎯 Test Results: {passed}/{total} tests passed")

        if self.session_id:
            print(f"🔗 Session ID: {self.session_id}")
            print(f"🌐 Session URL: {self.base_url}/sessions/{self.session_id}")

        return passed == total


def main():
    """Main function."""
    parser = argparse.ArgumentParser(
        description="Test the simplified RHOAI Feature Sizing API"
    )
    parser.add_argument("--url", default="http://localhost:8001", help="API base URL")
    parser.add_argument("--jira-key", required=True, help="JIRA issue key to test with")
    parser.add_argument(
        "--wait", action="store_true", help="Wait for processing to complete"
    )

    args = parser.parse_args()

    tester = SimpleAPITester(args.url)
    success = tester.run_full_test(args.jira_key, args.wait)

    exit(0 if success else 1)


if __name__ == "__main__":
    main()
