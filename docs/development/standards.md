# Coding Standards

This document outlines the coding standards and best practices for the RHOAI AI Feature Sizing project.

## 📋 Overview

Our coding standards ensure:
- **Consistency** across the codebase
- **Readability** for current and future developers
- **Maintainability** as the project grows
- **Quality** through automated tooling

We follow established Python conventions and extend them with project-specific guidelines.

## 🐍 Python Style Guide

### Base Standards

We follow [PEP 8](https://pep8.org/) with these specific configurations:

```ini
# .flake8
[flake8]
max-line-length = 88
extend-ignore = E203, W503, E501
exclude = 
    .git,
    __pycache__,
    .venv,
    build,
    dist,
    *.egg-info
per-file-ignores =
    __init__.py:F401
    tests/*:S101,S106
```

### Code Formatting

**Black** is our primary code formatter:

```toml
# pyproject.toml
[tool.black]
line-length = 88
target-version = ['py312']
include = '\.pyi?$'
extend-exclude = '''
/(
  # directories
  \.eggs
  | \.git
  | \.venv
  | build
  | dist
)/
'''
```

**Usage:**
```bash
# Format all files
uv run black .

# Check formatting without changes
uv run black --check .

# Format specific file
uv run black src/stages/refine_feature.py
```

### Import Organization

**isort** organizes imports:

```toml
# pyproject.toml
[tool.isort]
profile = "black"
multi_line_output = 3
line_length = 88
known_first_party = ["rhoai_feature_sizing", "stages", "tools"]
known_third_party = ["llama_stack_client", "fire", "requests"]
```

**Import Order:**
1. Standard library imports
2. Third-party imports
3. Local application imports

**Example:**
```python
# Standard library
import os
import sys
from pathlib import Path
from typing import Dict, List, Optional

# Third-party
import fire
import requests
from llama_stack_client import LlamaStackClient

# Local application
from stages.refine_feature import refine_feature
from tools.mcp_jira import create_jira_ticket
```

### Type Hints

**mypy** enforces type checking:

```toml
# pyproject.toml
[tool.mypy]
python_version = "3.12"
warn_return_any = true
warn_unused_configs = true
disallow_untyped_defs = true
disallow_incomplete_defs = true
check_untyped_defs = true
disallow_untyped_decorators = true
no_implicit_optional = true
warn_redundant_casts = true
warn_unused_ignores = true
warn_no_return = true
warn_unreachable = true
strict_equality = true
```

**Type Hint Examples:**
```python
from typing import Dict, List, Optional, Union, Any
from pathlib import Path

def refine_feature(
    client: LlamaStackClient,
    description: str,
    context: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """Refine a feature description using AI analysis.
    
    Args:
        client: Llama Stack client instance
        description: Raw feature description
        context: Optional context information
        
    Returns:
        Refined feature data with acceptance criteria
        
    Raises:
        ValueError: If description is empty or invalid
    """
    pass

class FeatureEstimator:
    """AI-powered feature estimation."""
    
    def __init__(self, model_name: str) -> None:
        self.model_name = model_name
        
    def estimate(self, feature_data: Dict[str, Any]) -> Dict[str, Union[int, float]]:
        """Estimate feature complexity and effort."""
        pass
```

## 📝 Documentation Standards

### Docstrings

We use **Google-style docstrings**:

```python
def estimate_feature(
    feature_data: Dict[str, Any],
    context: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """Estimate development effort for a feature.
    
    This function analyzes feature specifications and provides
    estimates for story points, hours, and complexity factors.
    
    Args:
        feature_data: Dictionary containing feature information including:
            - title: Feature title
            - description: Detailed description
            - acceptance_criteria: List of acceptance criteria
        context: Optional context containing:
            - team_velocity: Team's average velocity
            - project_type: Type of project (web_app, mobile_app, etc.)
            
    Returns:
        Dictionary containing estimation results:
            - story_points: Estimated story points (1-13 scale)
            - confidence: Confidence level (0-100)
            - estimated_hours: Hour range estimate
            - complexity_factors: Breakdown by complexity type
            
    Raises:
        ValueError: If feature_data is missing required fields
        ConnectionError: If Llama Stack service is unavailable
        
    Example:
        >>> feature = {
        ...     "title": "User Authentication",
        ...     "description": "Add OAuth2 login system",
        ...     "acceptance_criteria": ["Users can login with Google"]
        ... }
        >>> result = estimate_feature(feature)
        >>> print(result["story_points"])
        8
    """
    pass
```

### Code Comments

**When to comment:**
- Complex business logic
- Non-obvious algorithmic decisions
- Workarounds for external library limitations
- TODO items with context

**Comment style:**
```python
# TODO(username): Implement caching for API responses
# This reduces redundant calls to Llama Stack

def process_features(features: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    results = []
    
    # Process features in batches to avoid overwhelming the AI service
    # Batch size is optimized for memory usage vs. processing speed
    batch_size = 5
    
    for i in range(0, len(features), batch_size):
        batch = features[i:i + batch_size]
        
        # Parallel processing within batch for performance
        # Note: Llama Stack has built-in request queuing
        batch_results = process_batch_parallel(batch)
        results.extend(batch_results)
        
    return results
```

## 🏗️ Code Structure

### File Organization

```
src/
├── rhoai_feature_sizing/
│   ├── __init__.py
│   ├── main.py              # Application entry point
│   ├── config.py            # Configuration management
│   └── exceptions.py        # Custom exceptions
├── stages/
│   ├── __init__.py
│   ├── refine_feature.py    # Feature refinement logic
│   ├── estimate.py          # Estimation algorithms
│   └── draft_jiras.py       # JIRA ticket generation
├── tools/
│   ├── __init__.py
│   ├── mcp_jira.py          # JIRA integration
│   └── utils.py             # Utility functions
└── prompts/
    ├── refine_feature.md    # Prompt templates
    └── estimate_feature.md
```

### Class Design

**Single Responsibility Principle:**
```python
class FeatureRefiner:
    """Handles feature description refinement."""
    
    def __init__(self, llama_client: LlamaStackClient):
        self.client = llama_client
        
    def refine(self, description: str) -> Dict[str, Any]:
        """Refine a single feature description."""
        pass

class EstimationEngine:
    """Handles feature effort estimation."""
    
    def __init__(self, llama_client: LlamaStackClient):
        self.client = llama_client
        
    def estimate(self, refined_feature: Dict[str, Any]) -> Dict[str, Any]:
        """Estimate effort for a refined feature."""
        pass

class JiraIntegration:
    """Handles JIRA ticket operations."""
    
    def __init__(self, base_url: str, credentials: Dict[str, str]):
        self.base_url = base_url
        self.credentials = credentials
        
    def create_ticket(self, feature_data: Dict[str, Any]) -> str:
        """Create a JIRA ticket from feature data."""
        pass
```

### Function Design

**Small, focused functions:**
```python
def validate_feature_input(feature_data: Dict[str, Any]) -> None:
    """Validate feature data has required fields."""
    required_fields = ["title", "description"]
    
    for field in required_fields:
        if field not in feature_data or not feature_data[field].strip():
            raise ValueError(f"Missing or empty required field: {field}")

def extract_acceptance_criteria(ai_response: str) -> List[str]:
    """Extract acceptance criteria from AI response text."""
    # Implementation details...
    pass

def format_jira_description(
    feature: Dict[str, Any], 
    estimation: Dict[str, Any]
) -> str:
    """Format feature and estimation data for JIRA description."""
    # Implementation details...
    pass
```

## 🧪 Testing Standards

### Test Structure

```python
import pytest
from unittest.mock import Mock, patch
from llama_stack_client import LlamaStackClient

from stages.refine_feature import refine_feature
from tools.mcp_jira import create_jira_ticket

class TestFeatureRefinement:
    """Test cases for feature refinement functionality."""
    
    def setup_method(self):
        """Set up test fixtures before each test method."""
        self.mock_client = Mock(spec=LlamaStackClient)
        self.sample_feature = {
            "description": "Add user authentication system"
        }
    
    def test_refine_feature_with_valid_input(self):
        """Test feature refinement with valid input data."""
        # Arrange
        self.mock_client.some_method.return_value = "mocked response"
        expected_result = {"title": "User Authentication System"}
        
        # Act
        result = refine_feature(self.mock_client, "Add user auth")
        
        # Assert
        assert result["title"] == expected_result["title"]
        self.mock_client.some_method.assert_called_once()
    
    @pytest.mark.parametrize("invalid_input", [
        "",
        "   ",
        None,
    ])
    def test_refine_feature_with_invalid_input(self, invalid_input):
        """Test feature refinement rejects invalid input."""
        with pytest.raises(ValueError, match="Feature description cannot be empty"):
            refine_feature(self.mock_client, invalid_input)
    
    @patch('stages.refine_feature.some_external_dependency')
    def test_refine_feature_handles_external_errors(self, mock_dependency):
        """Test feature refinement handles external service errors."""
        # Arrange
        mock_dependency.side_effect = ConnectionError("Service unavailable")
        
        # Act & Assert
        with pytest.raises(ConnectionError):
            refine_feature(self.mock_client, "test feature")
```

### Test Naming Convention

- **Test classes**: `TestClassName`
- **Test methods**: `test_method_name_with_expected_behavior`
- **Test files**: `test_module_name.py`

### Test Categories

```python
# Unit tests - fast, isolated
@pytest.mark.unit
def test_feature_validation():
    pass

# Integration tests - test component interactions
@pytest.mark.integration  
def test_llama_stack_integration():
    pass

# End-to-end tests - full workflow
@pytest.mark.e2e
def test_complete_feature_estimation_workflow():
    pass

# Slow tests - require external services
@pytest.mark.slow
def test_with_real_llama_stack():
    pass
```

## 🔧 Configuration Management

### Environment Configuration

```python
# config.py
import os
from pathlib import Path
from typing import Dict, Any, Optional
from dataclasses import dataclass

@dataclass
class LlamaStackConfig:
    """Configuration for Llama Stack integration."""
    base_url: str = "http://localhost:8321"
    timeout: int = 30
    max_retries: int = 3
    model_name: str = "llama3.2:3b"

@dataclass
class JiraConfig:
    """Configuration for JIRA integration."""
    base_url: Optional[str] = None
    username: Optional[str] = None
    api_token: Optional[str] = None
    project_key: str = "PROJ"

@dataclass
class AppConfig:
    """Main application configuration."""
    log_level: str = "INFO"
    debug: bool = False
    llama_stack: LlamaStackConfig
    jira: JiraConfig
    
    @classmethod
    def from_env(cls) -> "AppConfig":
        """Create configuration from environment variables."""
        return cls(
            log_level=os.getenv("RHOAI_LOG_LEVEL", "INFO"),
            debug=os.getenv("RHOAI_DEBUG", "false").lower() == "true",
            llama_stack=LlamaStackConfig(
                base_url=os.getenv("LLAMA_STACK_BASE_URL", "http://localhost:8321"),
                timeout=int(os.getenv("LLAMA_STACK_TIMEOUT", "30")),
                model_name=os.getenv("INFERENCE_MODEL", "llama3.2:3b")
            ),
            jira=JiraConfig(
                base_url=os.getenv("JIRA_BASE_URL"),
                username=os.getenv("JIRA_USERNAME"),
                api_token=os.getenv("JIRA_API_TOKEN")
            )
        )
```

## 🚨 Error Handling

### Custom Exceptions

```python
# exceptions.py
class RhoaiError(Exception):
    """Base exception for RHOAI feature sizing."""
    pass

class FeatureRefinementError(RhoaiError):
    """Raised when feature refinement fails."""
    pass

class EstimationError(RhoaiError):
    """Raised when feature estimation fails."""
    pass

class JiraIntegrationError(RhoaiError):
    """Raised when JIRA operations fail."""
    pass

class LlamaStackError(RhoaiError):
    """Raised when Llama Stack communication fails."""
    pass
```

### Error Handling Patterns

```python
import logging
from typing import Optional

logger = logging.getLogger(__name__)

def safe_api_call(func, *args, **kwargs) -> Optional[Dict[str, Any]]:
    """Safely execute API calls with proper error handling."""
    try:
        return func(*args, **kwargs)
    except ConnectionError as e:
        logger.error(f"Connection failed: {e}")
        raise LlamaStackError(f"Failed to connect to Llama Stack: {e}")
    except TimeoutError as e:
        logger.error(f"Request timeout: {e}")
        raise LlamaStackError(f"Request timed out: {e}")
    except Exception as e:
        logger.exception(f"Unexpected error in {func.__name__}")
        raise RhoaiError(f"Unexpected error: {e}")

def refine_feature_with_retry(
    client: LlamaStackClient,
    description: str,
    max_retries: int = 3
) -> Dict[str, Any]:
    """Refine feature with automatic retry on failure."""
    for attempt in range(max_retries):
        try:
            return refine_feature(client, description)
        except LlamaStackError as e:
            if attempt == max_retries - 1:
                raise
            logger.warning(f"Attempt {attempt + 1} failed: {e}. Retrying...")
            time.sleep(2 ** attempt)  # Exponential backoff
    
    raise FeatureRefinementError("All retry attempts failed")
```

## 📊 Logging

### Logging Configuration

```python
# logging_config.py
import logging
import sys
from typing import Dict, Any

def setup_logging(log_level: str = "INFO", log_file: Optional[str] = None) -> None:
    """Configure application logging."""
    
    log_format = (
        "%(asctime)s - %(name)s - %(levelname)s - "
        "%(filename)s:%(lineno)d - %(message)s"
    )
    
    handlers = [logging.StreamHandler(sys.stdout)]
    
    if log_file:
        handlers.append(logging.FileHandler(log_file))
    
    logging.basicConfig(
        level=getattr(logging, log_level.upper()),
        format=log_format,
        handlers=handlers
    )
    
    # Suppress verbose third-party logging
    logging.getLogger("urllib3").setLevel(logging.WARNING)
    logging.getLogger("requests").setLevel(logging.WARNING)

# Usage in application code
logger = logging.getLogger(__name__)

def process_feature(feature_data: Dict[str, Any]) -> Dict[str, Any]:
    """Process a feature with proper logging."""
    feature_id = feature_data.get("id", "unknown")
    
    logger.info(f"Starting feature processing for {feature_id}")
    
    try:
        result = perform_processing(feature_data)
        logger.info(f"Successfully processed feature {feature_id}")
        return result
    except Exception as e:
        logger.error(f"Failed to process feature {feature_id}: {e}")
        raise
```

## 🔒 Security Practices

### Secure Configuration

```python
import os
from cryptography.fernet import Fernet

class SecureConfig:
    """Handle sensitive configuration securely."""
    
    def __init__(self):
        self.encryption_key = os.getenv("ENCRYPTION_KEY")
        if self.encryption_key:
            self.cipher = Fernet(self.encryption_key.encode())
    
    def get_secure_value(self, key: str) -> Optional[str]:
        """Get encrypted configuration value."""
        encrypted_value = os.getenv(f"ENCRYPTED_{key}")
        if not encrypted_value or not self.cipher:
            return os.getenv(key)
        
        try:
            return self.cipher.decrypt(encrypted_value.encode()).decode()
        except Exception:
            logger.warning(f"Failed to decrypt {key}")
            return None

# Never log sensitive information
def safe_log_config(config: Dict[str, Any]) -> None:
    """Log configuration with sensitive values masked."""
    safe_config = config.copy()
    
    sensitive_keys = ["password", "token", "secret", "key"]
    
    for key, value in safe_config.items():
        if any(sensitive in key.lower() for sensitive in sensitive_keys):
            safe_config[key] = "***masked***"
    
    logger.info(f"Application configuration: {safe_config}")
```

## 🚀 Performance Guidelines

### Efficient Code Patterns

```python
# Use appropriate data structures
from collections import defaultdict, Counter
from typing import Set, Dict, List

# Efficient feature grouping
def group_features_by_complexity(features: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
    """Group features by complexity level efficiently."""
    grouped = defaultdict(list)
    
    for feature in features:
        complexity = feature.get("complexity", "medium")
        grouped[complexity].append(feature)
    
    return dict(grouped)

# Batch processing for performance
async def process_features_batch(
    features: List[Dict[str, Any]],
    batch_size: int = 5
) -> List[Dict[str, Any]]:
    """Process features in batches for better performance."""
    results = []
    
    for i in range(0, len(features), batch_size):
        batch = features[i:i + batch_size]
        
        # Process batch concurrently
        tasks = [process_single_feature(feature) for feature in batch]
        batch_results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Handle any exceptions in batch
        for result in batch_results:
            if isinstance(result, Exception):
                logger.error(f"Batch processing error: {result}")
            else:
                results.append(result)
    
    return results
```

## 📋 Code Review Checklist

Before submitting code for review, ensure:

### Functionality
- [ ] Code works as intended
- [ ] All tests pass
- [ ] Error cases are handled appropriately
- [ ] No obvious performance issues

### Code Quality
- [ ] Follows coding standards (Black, isort, flake8, mypy)
- [ ] Functions have clear, single responsibilities
- [ ] Variable and function names are descriptive
- [ ] No commented-out code or debugging statements

### Documentation
- [ ] Public functions have docstrings
- [ ] Complex logic is commented
- [ ] README and docs are updated if needed
- [ ] API changes are documented

### Testing
- [ ] New functionality has tests
- [ ] Tests cover edge cases
- [ ] Tests are fast and reliable
- [ ] Integration tests pass with real services

### Security
- [ ] No sensitive data in code or logs
- [ ] Input validation is present
- [ ] Dependencies are up to date
- [ ] No obvious security vulnerabilities

---

## 🔗 Related Documentation

- [Development Setup](./setup.md) - Setting up your development environment
- [Testing Guidelines](./testing.md) - Comprehensive testing practices
- [Contributing Guide](../../CONTRIBUTING.md) - How to contribute to the project

*These standards are continuously refined. Please suggest improvements through issues or discussions.*