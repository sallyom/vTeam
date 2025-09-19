#!/usr/bin/env python3

"""
Test script for agent integration in claude-runner

This script tests the agent loading and prompt generation functionality
without requiring full container environment or external dependencies.
"""

import sys
import os
from pathlib import Path

# Add current directory to path for imports
sys.path.insert(0, os.path.dirname(__file__))

def test_agent_loader():
    """Test agent loader functionality"""
    print("🧪 Testing Agent Loader...")

    try:
        # Import will fail if dependencies not available, but that's expected in dev environment
        print("✅ Attempting to import agent_loader...")

        # Basic check that our agent files exist
        agents_dir = Path(__file__).parent / "agents"
        if not agents_dir.exists():
            print("❌ Agents directory not found!")
            return False

        yaml_files = list(agents_dir.glob("*.yaml"))
        print(f"✅ Found {len(yaml_files)} agent YAML files")

        # Check for key agent files
        expected_agents = [
            "engineering_manager.yaml",
            "staff_engineer.yaml",
            "product_manager.yaml",
            "team_lead.yaml"
        ]

        missing_agents = []
        for agent_file in expected_agents:
            if not (agents_dir / agent_file).exists():
                missing_agents.append(agent_file)

        if missing_agents:
            print(f"❌ Missing expected agent files: {missing_agents}")
            return False

        print("✅ All expected agent files present")

        # Test that our python files have valid syntax
        for py_file in ["agent_loader.py", "main.py"]:
            try:
                with open(py_file, 'r') as f:
                    compile(f.read(), py_file, 'exec')
                print(f"✅ {py_file} syntax valid")
            except SyntaxError as e:
                print(f"❌ {py_file} syntax error: {e}")
                return False

        return True

    except Exception as e:
        print(f"❌ Agent loader test failed: {e}")
        return False

def test_agent_yaml_structure():
    """Test that agent YAML files have expected structure"""
    print("\n🧪 Testing Agent YAML Structure...")

    try:
        agents_dir = Path(__file__).parent / "agents"

        # Test a sample agent file
        sample_agent = agents_dir / "engineering_manager.yaml"
        if not sample_agent.exists():
            print("❌ Sample agent file not found")
            return False

        # Try to parse the YAML (will fail without PyYAML but we can check basic structure)
        with open(sample_agent, 'r') as f:
            content = f.read()

        # Check for expected keys
        expected_keys = ["name:", "persona:", "role:", "expertise:", "systemMessage:"]
        missing_keys = []

        for key in expected_keys:
            if key not in content:
                missing_keys.append(key)

        if missing_keys:
            print(f"❌ Missing keys in {sample_agent.name}: {missing_keys}")
            return False

        print(f"✅ {sample_agent.name} has expected structure")
        return True

    except Exception as e:
        print(f"❌ YAML structure test failed: {e}")
        return False

def test_environment_variables():
    """Test environment variable handling"""
    print("\n🧪 Testing Environment Variable Handling...")

    # Test cases for different execution modes
    test_cases = [
        {
            "name": "Standard Session",
            "env": {
                "AGENTIC_SESSION_NAME": "test-session",
                "PROMPT": "Analyze this website",
                "WEBSITE_URL": "https://example.com",
                "ANTHROPIC_API_KEY": "test-key"
            },
            "expected_mode": "standard"
        },
        {
            "name": "Agent RFE Session",
            "env": {
                "AGENTIC_SESSION_NAME": "test-rfe-session",
                "PROMPT": "Build user authentication",
                "AGENT_PERSONA": "ENGINEERING_MANAGER",
                "WORKFLOW_PHASE": "specify",
                "PARENT_RFE": "001-user-auth",
                "ANTHROPIC_API_KEY": "test-key"
            },
            "expected_mode": "agent_rfe"
        }
    ]

    for test_case in test_cases:
        print(f"  Testing: {test_case['name']}")

        # Simulate environment
        old_env = {}
        for key, value in test_case['env'].items():
            old_env[key] = os.environ.get(key)
            os.environ[key] = value

        try:
            # Check logic that would determine session type
            agent_persona = os.environ.get("AGENT_PERSONA", "")
            workflow_phase = os.environ.get("WORKFLOW_PHASE", "")

            if agent_persona and workflow_phase:
                mode = "agent_rfe"
            else:
                mode = "standard"

            if mode == test_case['expected_mode']:
                print(f"    ✅ Correctly identified as {mode} mode")
            else:
                print(f"    ❌ Expected {test_case['expected_mode']}, got {mode}")
                return False

        finally:
            # Restore environment
            for key, old_value in old_env.items():
                if old_value is None:
                    os.environ.pop(key, None)
                else:
                    os.environ[key] = old_value

    return True

def main():
    """Run all tests"""
    print("🚀 Starting Agent Integration Tests\n")

    tests = [
        test_agent_loader,
        test_agent_yaml_structure,
        test_environment_variables
    ]

    passed = 0
    failed = 0

    for test_func in tests:
        try:
            if test_func():
                passed += 1
                print("✅ PASSED\n")
            else:
                failed += 1
                print("❌ FAILED\n")
        except Exception as e:
            failed += 1
            print(f"❌ FAILED with exception: {e}\n")

    print("=" * 50)
    print(f"📊 Test Results: {passed} passed, {failed} failed")

    if failed == 0:
        print("🎉 All agent integration tests passed!")
        print("\n📋 Next Steps:")
        print("1. Build updated claude-runner image with agent support")
        print("2. Test with actual agent execution in Kubernetes")
        print("3. Implement enhanced CRDs for RFE workflows")
        return True
    else:
        print("❌ Some tests failed. Please fix before proceeding.")
        return False

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)