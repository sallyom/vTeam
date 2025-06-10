# Testing Guidelines

This document outlines the testing strategy, practices, and tools for the RHOAI AI Feature Sizing project, which integrates with [Llama Stack](https://llama-stack.readthedocs.io/en/latest/).

## 🧪 Testing Philosophy

Our testing approach follows these principles:

- **Test-Driven Development (TDD)**: Write tests before implementation when possible
- **Comprehensive Coverage**: Unit, integration, and end-to-end tests
- **Fast Feedback**: Quick test execution for rapid development cycles
- **Reliable Tests**: Deterministic and stable test suite
- **Real-World Scenarios**: Tests that reflect actual usage patterns

## 📋 Testing Strategy

### Test Pyramid

```
        🔺 End-to-End Tests (Few)
       🔺🔺 Integration Tests (Some)  
      🔺🔺🔺 Unit Tests (Many)
```

**Unit Tests (70%)**
- Fast execution (< 1 second each)
- Isolated components
- Mock external dependencies
- High code coverage

**Integration Tests (20%)**
- Component interactions
- Database operations
- External service integrations
- Medium execution time

**End-to-End Tests (10%)**
- Complete user workflows
- Real service interactions
- Slower execution
- Critical path validation

## 🛠️ Testing Tools and Framework

### Core Testing Stack

```toml
# pyproject.toml - Test dependencies
[project.optional-dependencies]
test = [
    "pytest>=7.0.0",
    "pytest-cov>=4.0.0",
    "pytest-asyncio>=0.21.0",
    "pytest-mock>=3.10.0",
    "pytest-xdist>=3.0.0",      # Parallel test execution
    "pytest-timeout>=2.1.0",     # Test timeout handling
    "pytest-randomly>=3.12.0",   # Random test order
    "factory-boy>=3.2.0",        # Test data factories
    "responses>=0.23.0",         # HTTP mocking
    "freezegun>=1.2.0",          # Time mocking
]
```

### Test Configuration

```ini
# pytest.ini
[tool:pytest]
minversion = 7.0
addopts = 
    -ra
    --strict-markers
    --strict-config
    --cov=src
    --cov-branch
    --cov-report=term-missing
    --cov-report=html:htmlcov
    --cov-report=xml
    --cov-fail-under=80
testpaths = tests
python_files = test_*.py
python_classes = Test*
python_functions = test_*
markers =
    unit: Unit tests (fast, isolated)
    integration: Integration tests (medium speed)
    e2e: End-to-end tests (slow)
    slow: Tests that take longer than 5 seconds
    external: Tests requiring external services
    llama_stack: Tests requiring Llama Stack
    jira: Tests requiring JIRA integration
filterwarnings =
    ignore::DeprecationWarning
    ignore::PendingDeprecationWarning
```

## 📁 Test Structure

### Directory Organization

```
tests/
├── __init__.py
├── conftest.py              # Shared fixtures and configuration
├── unit/                    # Unit tests
│   ├── test_refine_feature.py
│   ├── test_estimate.py
│   ├── test_jira_integration.py
│   └── test_utils.py
├── integration/             # Integration tests
│   ├── test_llama_stack_integration.py
│   ├── test_jira_api_integration.py
│   └── test_database_operations.py
├── e2e/                     # End-to-end tests
│   ├── test_complete_workflow.py
│   └── test_batch_processing.py
├── fixtures/                # Test data and fixtures
│   ├── sample_features.json
│   ├── mock_responses.json
│   └── test_data_factory.py
├── mocks/                   # Mock services
│   ├── mock_llama_stack.py
│   └── mock_jira_server.py
└── utils/                   # Test utilities
    ├── assertions.py
    └── helpers.py
```

### Test Fixtures and Configuration

```python
# tests/conftest.py
import pytest
import asyncio
from unittest.mock import Mock, MagicMock
from pathlib import Path
from typing import Dict, Any

from llama_stack_client import LlamaStackClient
from stages.refine_feature import FeatureRefiner
from tools.mcp_jira import JiraIntegration

# Test data directory
TEST_DATA_DIR = Path(__file__).parent / "fixtures"

@pytest.fixture(scope="session")
def event_loop():
    """Create an instance of the default event loop for the test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()

@pytest.fixture
def mock_llama_client():
    """Mock Llama Stack client for unit tests."""
    client = Mock(spec=LlamaStackClient)
    return client

@pytest.fixture
def sample_feature_data():
    """Sample feature data for testing."""
    return {
        "id": "test-feature-001",
        "title": "User Authentication System",
        "description": "Implement comprehensive user authentication with OAuth2 support",
        "acceptance_criteria": [
            "Users can register with email and password",
            "Users can login with Google OAuth2",
            "Session management with secure tokens"
        ],
        "technical_requirements": [
            "OAuth2 client configuration",
            "JWT token management",
            "Password hashing with bcrypt"
        ]
    }

@pytest.fixture
def sample_estimation_result():
    """Sample estimation result for testing."""
    return {
        "story_points": 8,
        "confidence": 85,
        "estimated_hours": {"min": 28, "max": 40, "expected": 32},
        "complexity_factors": {
            "technical": "medium",
            "business": "low",
            "integration": "high"
        },
        "risk_factors": [
            {
                "factor": "OAuth provider API changes",
                "impact": "medium",
                "probability": "low"
            }
        ]
    }

@pytest.fixture
def feature_refiner(mock_llama_client):
    """Feature refiner instance for testing."""
    return FeatureRefiner(mock_llama_client)

@pytest.fixture
def temp_test_db():
    """Temporary test database."""
    # Setup test database
    db_path = ":memory:"  # SQLite in-memory database
    # Initialize database schema
    yield db_path
    # Cleanup handled automatically with in-memory DB

@pytest.fixture(scope="session")
def test_config():
    """Test configuration."""
    return {
        "llama_stack": {
            "base_url": "http://localhost:8322",  # Test port
            "timeout": 10,
            "model_name": "test-model"
        },
        "jira": {
            "base_url": "http://localhost:8080",  # Mock JIRA server
            "username": "test@example.com",
            "api_token": "test-token"
        }
    }
```

## 🧪 Unit Testing

### Test Structure and Patterns

```python
# tests/unit/test_refine_feature.py
import pytest
from unittest.mock import Mock, patch, MagicMock
from stages.refine_feature import refine_feature, FeatureRefiner

class TestFeatureRefinement:
    """Test cases for feature refinement functionality."""
    
    def test_refine_feature_with_valid_input(self, mock_llama_client, sample_feature_data):
        """Test successful feature refinement with valid input."""
        # Arrange
        expected_response = {
            "refined_description": "Enhanced feature description...",
            "acceptance_criteria": ["Criterion 1", "Criterion 2"]
        }
        mock_llama_client.inference.completion.return_value = Mock(
            content="Mocked AI response"
        )
        
        # Act
        result = refine_feature(mock_llama_client, "Add user authentication")
        
        # Assert
        assert isinstance(result, dict)
        assert "refined_description" in result
        mock_llama_client.inference.completion.assert_called_once()
    
    @pytest.mark.parametrize("invalid_input,expected_error", [
        ("", "Feature description cannot be empty"),
        ("   ", "Feature description cannot be empty"),
        (None, "Feature description must be a string"),
        ("a" * 10000, "Feature description too long"),
    ])
    def test_refine_feature_input_validation(
        self, 
        mock_llama_client, 
        invalid_input, 
        expected_error
    ):
        """Test input validation for feature refinement."""
        with pytest.raises(ValueError, match=expected_error):
            refine_feature(mock_llama_client, invalid_input)
    
    def test_refine_feature_handles_llama_stack_error(self, mock_llama_client):
        """Test error handling when Llama Stack fails."""
        # Arrange
        mock_llama_client.inference.completion.side_effect = ConnectionError(
            "Failed to connect to Llama Stack"
        )
        
        # Act & Assert
        with pytest.raises(ConnectionError):
            refine_feature(mock_llama_client, "Test feature")
    
    @patch('stages.refine_feature.load_prompt_template')
    def test_refine_feature_uses_correct_prompt(
        self, 
        mock_load_prompt, 
        mock_llama_client
    ):
        """Test that correct prompt template is used."""
        # Arrange
        mock_load_prompt.return_value = "Test prompt template"
        mock_llama_client.inference.completion.return_value = Mock(content="Response")
        
        # Act
        refine_feature(mock_llama_client, "Test feature")
        
        # Assert
        mock_load_prompt.assert_called_with("refine_feature.md")

class TestFeatureRefinerClass:
    """Test cases for FeatureRefiner class."""
    
    def test_refiner_initialization(self, mock_llama_client):
        """Test FeatureRefiner initialization."""
        refiner = FeatureRefiner(mock_llama_client)
        assert refiner.client == mock_llama_client
    
    def test_refiner_batch_processing(self, feature_refiner):
        """Test batch processing of multiple features."""
        # Arrange
        features = ["Feature 1", "Feature 2", "Feature 3"]
        feature_refiner.client.inference.completion.return_value = Mock(
            content="Mocked response"
        )
        
        # Act
        results = feature_refiner.refine_batch(features)
        
        # Assert
        assert len(results) == len(features)
        assert feature_refiner.client.inference.completion.call_count == len(features)
```

### Testing Async Code

```python
# tests/unit/test_async_operations.py
import pytest
import asyncio
from unittest.mock import AsyncMock, Mock

@pytest.mark.asyncio
async def test_async_feature_processing():
    """Test asynchronous feature processing."""
    # Arrange
    mock_client = Mock()
    mock_client.inference.completion = AsyncMock(
        return_value=Mock(content="Async response")
    )
    
    # Act
    result = await async_refine_feature(mock_client, "Test feature")
    
    # Assert
    assert result is not None
    mock_client.inference.completion.assert_called_once()

@pytest.mark.asyncio
async def test_concurrent_batch_processing():
    """Test concurrent processing of feature batches."""
    # Arrange
    features = [f"Feature {i}" for i in range(5)]
    mock_client = Mock()
    mock_client.inference.completion = AsyncMock(
        return_value=Mock(content="Response")
    )
    
    # Act
    results = await process_features_concurrently(mock_client, features)
    
    # Assert
    assert len(results) == len(features)
    assert mock_client.inference.completion.call_count == len(features)
```

## 🔗 Integration Testing

### Llama Stack Integration

```python
# tests/integration/test_llama_stack_integration.py
import pytest
import requests
from llama_stack_client import LlamaStackClient

@pytest.mark.integration
@pytest.mark.llama_stack
class TestLlamaStackIntegration:
    """Integration tests with Llama Stack service."""
    
    @pytest.fixture(autouse=True)
    def setup_llama_stack(self):
        """Ensure Llama Stack is available for testing."""
        try:
            response = requests.get("http://localhost:8321/health", timeout=5)
            if response.status_code != 200:
                pytest.skip("Llama Stack not available")
        except requests.RequestException:
            pytest.skip("Llama Stack not available")
    
    def test_llama_stack_connection(self):
        """Test connection to Llama Stack service."""
        client = LlamaStackClient(base_url="http://localhost:8321")
        
        # Test basic connectivity
        models = client.models.list()
        assert len(models) > 0
    
    def test_feature_refinement_integration(self):
        """Test actual feature refinement with Llama Stack."""
        client = LlamaStackClient(base_url="http://localhost:8321")
        
        # Act
        result = refine_feature(client, "Add user authentication system")
        
        # Assert
        assert isinstance(result, dict)
        assert "refined_description" in result
        assert len(result["refined_description"]) > 0
    
    @pytest.mark.slow
    def test_large_feature_processing(self):
        """Test processing of large feature descriptions."""
        client = LlamaStackClient(base_url="http://localhost:8321")
        
        large_description = "A" * 5000  # Large feature description
        
        # Act
        result = refine_feature(client, large_description)
        
        # Assert
        assert result is not None
```

### JIRA Integration Testing

```python
# tests/integration/test_jira_integration.py
import pytest
import responses
from tools.mcp_jira import JiraIntegration, create_jira_ticket

@pytest.mark.integration
@pytest.mark.jira
class TestJiraIntegration:
    """Integration tests for JIRA API."""
    
    @responses.activate
    def test_jira_ticket_creation(self, sample_feature_data):
        """Test JIRA ticket creation with mocked API."""
        # Arrange
        responses.add(
            responses.POST,
            "http://localhost:8080/rest/api/2/issue",
            json={"id": "10001", "key": "PROJ-123"},
            status=201
        )
        
        jira = JiraIntegration(
            base_url="http://localhost:8080",
            username="test@example.com",
            api_token="test-token"
        )
        
        # Act
        ticket_id = jira.create_ticket(sample_feature_data)
        
        # Assert
        assert ticket_id == "PROJ-123"
    
    @responses.activate
    def test_jira_authentication_failure(self):
        """Test handling of JIRA authentication failure."""
        # Arrange
        responses.add(
            responses.POST,
            "http://localhost:8080/rest/api/2/issue",
            status=401
        )
        
        jira = JiraIntegration(
            base_url="http://localhost:8080",
            username="invalid",
            api_token="invalid"
        )
        
        # Act & Assert
        with pytest.raises(Exception, match="Authentication failed"):
            jira.create_ticket({"title": "Test", "description": "Test"})
```

## 🌐 End-to-End Testing

### Complete Workflow Testing

```python
# tests/e2e/test_complete_workflow.py
import pytest
from unittest.mock import patch
from main import main

@pytest.mark.e2e
@pytest.mark.slow
class TestCompleteWorkflow:
    """End-to-end tests for complete feature sizing workflow."""
    
    @patch('sys.argv', ['main.py', '--feature', 'Add user authentication'])
    def test_complete_feature_sizing_workflow(self, capfd):
        """Test complete workflow from description to JIRA ticket."""
        # Act
        main()
        
        # Assert
        captured = capfd.readouterr()
        assert "Feature refined successfully" in captured.out
        assert "Estimation completed" in captured.out
        assert "JIRA ticket created" in captured.out
    
    def test_batch_processing_workflow(self, tmp_path):
        """Test batch processing of multiple features."""
        # Arrange
        features_file = tmp_path / "features.txt"
        features_file.write_text(
            "Add user authentication\n"
            "Implement payment gateway\n"
            "Create admin dashboard\n"
        )
        
        # Act
        with patch('sys.argv', ['main.py', '--batch-file', str(features_file)]):
            main()
        
        # Assert
        # Verify all features were processed
        # Check output files were created
        pass
    
    @pytest.mark.external
    def test_real_llama_stack_workflow(self):
        """Test workflow with real Llama Stack instance."""
        # This test requires actual Llama Stack service
        pytest.skip("Requires real Llama Stack service")
```

## 🏭 Test Data Management

### Test Data Factories

```python
# tests/fixtures/test_data_factory.py
import factory
from typing import Dict, Any, List

class FeatureDataFactory(factory.DictFactory):
    """Factory for generating test feature data."""
    
    id = factory.Sequence(lambda n: f"feature-{n:03d}")
    title = factory.Faker('sentence', nb_words=4)
    description = factory.Faker('text', max_nb_chars=500)
    
    @factory.LazyAttribute
    def acceptance_criteria(self):
        return [
            factory.Faker('sentence').generate(),
            factory.Faker('sentence').generate(),
            factory.Faker('sentence').generate(),
        ]
    
    @factory.LazyAttribute
    def technical_requirements(self):
        return [
            factory.Faker('sentence').generate(),
            factory.Faker('sentence').generate(),
        ]

class EstimationResultFactory(factory.DictFactory):
    """Factory for generating test estimation results."""
    
    story_points = factory.Faker('random_int', min=1, max=13)
    confidence = factory.Faker('random_int', min=60, max=100)
    
    @factory.LazyAttribute
    def estimated_hours(self):
        base = self.story_points * 4
        return {
            "min": base - 8,
            "max": base + 8,
            "expected": base
        }
    
    @factory.SubFactory
    def complexity_factors(self):
        return {
            "technical": factory.Faker('random_element', 
                                     elements=['low', 'medium', 'high']),
            "business": factory.Faker('random_element', 
                                    elements=['low', 'medium', 'high']),
            "integration": factory.Faker('random_element', 
                                       elements=['low', 'medium', 'high'])
        }

# Usage in tests
def test_with_generated_data():
    """Test using factory-generated data."""
    feature = FeatureDataFactory()
    estimation = EstimationResultFactory(story_points=8)
    
    assert feature['id'].startswith('feature-')
    assert estimation['story_points'] == 8
```

### Mock Services

```python
# tests/mocks/mock_llama_stack.py
import json
from http.server import HTTPServer, BaseHTTPRequestHandler
import threading
from typing import Dict, Any

class MockLlamaStackHandler(BaseHTTPRequestHandler):
    """Mock HTTP handler for Llama Stack API."""
    
    def do_GET(self):
        """Handle GET requests."""
        if self.path == '/health':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"status": "healthy"}).encode())
        elif self.path == '/models':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            models = [
                {
                    "id": "test-model",
                    "name": "Test Model",
                    "type": "llm"
                }
            ]
            self.wfile.write(json.dumps(models).encode())
    
    def do_POST(self):
        """Handle POST requests."""
        if self.path == '/inference/completion':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            
            # Mock AI response
            response = {
                "content": "This is a mock AI response for testing purposes."
            }
            
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(response).encode())

class MockLlamaStackServer:
    """Mock Llama Stack server for testing."""
    
    def __init__(self, port: int = 8322):
        self.port = port
        self.server = None
        self.thread = None
    
    def start(self):
        """Start the mock server."""
        self.server = HTTPServer(('localhost', self.port), MockLlamaStackHandler)
        self.thread = threading.Thread(target=self.server.serve_forever)
        self.thread.daemon = True
        self.thread.start()
    
    def stop(self):
        """Stop the mock server."""
        if self.server:
            self.server.shutdown()
            self.server.server_close()
        if self.thread:
            self.thread.join()

# Pytest fixture for mock server
@pytest.fixture
def mock_llama_stack_server():
    """Provide a mock Llama Stack server for testing."""
    server = MockLlamaStackServer()
    server.start()
    yield server
    server.stop()
```

## 📊 Test Coverage and Quality

### Coverage Configuration

```toml
# pyproject.toml
[tool.coverage.run]
source = ["src"]
omit = [
    "*/tests/*",
    "*/__pycache__/*",
    "*/venv/*",
    "*/migrations/*",
    "*/settings/*",
    "*/conftest.py",
]

[tool.coverage.report]
exclude_lines = [
    "pragma: no cover",
    "def __repr__",
    "if self.debug:",
    "if settings.DEBUG",
    "raise AssertionError",
    "raise NotImplementedError",
    "if 0:",
    "if __name__ == .__main__.:",
    "class .*\\bProtocol\\):",
    "@(abc\\.)?abstractmethod",
]
show_missing = true
skip_covered = false

[tool.coverage.html]
directory = "htmlcov"
```

### Quality Gates

```yaml
# .github/workflows/test.yml
name: Test Suite
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        python-version: [3.12, 3.13]
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Set up Python
      uses: actions/setup-python@v4
      with:
        python-version: ${{ matrix.python-version }}
    
    - name: Install dependencies
      run: |
        curl -LsSf https://astral.sh/uv/install.sh | sh
        uv sync --all-extras
    
    - name: Lint code
      run: |
        uv run flake8 src tests
        uv run black --check src tests
        uv run isort --check-only src tests
        uv run mypy src
    
    - name: Run tests
      run: |
        uv run pytest --cov=src --cov-report=xml --cov-fail-under=80
    
    - name: Upload coverage to Codecov
      uses: codecov/codecov-action@v3
      with:
        file: ./coverage.xml
```

## 🚀 Performance Testing

### Load Testing

```python
# tests/performance/test_load.py
import pytest
import asyncio
import time
from concurrent.futures import ThreadPoolExecutor
from stages.refine_feature import refine_feature

@pytest.mark.performance
class TestPerformance:
    """Performance tests for feature sizing operations."""
    
    def test_single_feature_performance(self, mock_llama_client):
        """Test performance of single feature refinement."""
        start_time = time.time()
        
        result = refine_feature(mock_llama_client, "Test feature")
        
        end_time = time.time()
        execution_time = end_time - start_time
        
        assert result is not None
        assert execution_time < 5.0  # Should complete within 5 seconds
    
    def test_concurrent_processing_performance(self, mock_llama_client):
        """Test performance under concurrent load."""
        features = [f"Feature {i}" for i in range(20)]
        
        start_time = time.time()
        
        with ThreadPoolExecutor(max_workers=5) as executor:
            futures = [
                executor.submit(refine_feature, mock_llama_client, feature)
                for feature in features
            ]
            results = [future.result() for future in futures]
        
        end_time = time.time()
        total_time = end_time - start_time
        
        assert len(results) == len(features)
        assert total_time < 30.0  # Should complete within 30 seconds
        
    @pytest.mark.slow
    def test_memory_usage(self, mock_llama_client):
        """Test memory usage with large datasets."""
        import psutil
        import os
        
        process = psutil.Process(os.getpid())
        initial_memory = process.memory_info().rss
        
        # Process many features
        features = [f"Large feature description {i}" * 100 for i in range(100)]
        
        for feature in features:
            refine_feature(mock_llama_client, feature)
        
        final_memory = process.memory_info().rss
        memory_increase = final_memory - initial_memory
        
        # Memory increase should be reasonable (less than 100MB)
        assert memory_increase < 100 * 1024 * 1024
```

## 🔍 Test Debugging and Troubleshooting

### Debugging Test Failures

```bash
# Run tests with verbose output
uv run pytest -v -s

# Run specific test with debugging
uv run pytest -v -s tests/unit/test_refine_feature.py::test_specific_case

# Run tests with pdb on failure
uv run pytest --pdb

# Run tests with detailed output
uv run pytest --tb=long

# Run only failed tests from last run
uv run pytest --lf

# Run tests in parallel for speed
uv run pytest -n auto
```

### Test Environment Issues

```python
# tests/utils/debugging.py
import os
import sys
import logging

def debug_test_environment():
    """Print debug information about test environment."""
    print("=== Test Environment Debug Info ===")
    print(f"Python version: {sys.version}")
    print(f"Working directory: {os.getcwd()}")
    print(f"Python path: {sys.path}")
    print(f"Environment variables:")
    for key, value in os.environ.items():
        if 'TEST' in key or 'PYTEST' in key:
            print(f"  {key}={value}")

# Add to conftest.py for debugging
def pytest_configure(config):
    """Configure pytest with debugging if needed."""
    if config.getoption("verbose") > 1:
        debug_test_environment()
```

## 📋 Testing Checklist

Before submitting code:

### Unit Tests
- [ ] All new functions have unit tests
- [ ] Tests cover happy path and edge cases
- [ ] Tests use mocks for external dependencies
- [ ] Tests run in under 1 second each
- [ ] Code coverage is above 80%

### Integration Tests
- [ ] Component interactions are tested
- [ ] External service integrations work
- [ ] Error handling is tested
- [ ] Tests clean up after themselves

### Test Quality
- [ ] Tests have descriptive names
- [ ] Tests are independent and isolated
- [ ] Test data is realistic but minimal
- [ ] No flaky or intermittent test failures

### Performance
- [ ] Performance-critical code has benchmarks
- [ ] Memory usage is reasonable
- [ ] No performance regressions

---

## 🔗 Related Documentation

- [Development Setup](./setup.md) - Setting up your development environment
- [Coding Standards](./standards.md) - Code quality and style guidelines
- [Contributing Guide](../../CONTRIBUTING.md) - How to contribute to the project

*Testing is a collaborative effort. Please help improve our test suite by adding tests for new features and reporting any issues.*