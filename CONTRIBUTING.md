# Contributing to RHOAI AI Feature Sizing

Thank you for your interest in contributing to the RHOAI AI Feature Sizing project! This guide will help you get started with contributing to our Llama Stack-based AI feature estimation tool.

## 🚀 Quick Start for Contributors

### Prerequisites

- Python 3.12+
- [uv](https://docs.astral.sh/uv/) for dependency management
- Git for version control
- Access to Llama Stack (see [Llama Stack Quickstart](https://llama-stack.readthedocs.io/en/latest/getting_started/index.html#step-1-install-and-setup))

### Development Setup

1. **Fork and Clone**
   ```bash
   git fork <repository-url>
   git clone <your-fork-url>
   cd rhoai-ai-feature-sizing
   ```

2. **Set up Development Environment**
   ```bash
   # Install dependencies using uv
   uv sync --extra dev
   uv pip install -e .
   source .venv/bin/activate
   ```

3. **Configure Environment**
   Create a `.env` file with necessary environment variables:
   ```bash
   LLAMA_STACK_BASE_URL=http://localhost:8321
   LLAMA_STACK_CLIENT_LOG=debug
   LLAMA_STACK_PORT=8321
   LLAMA_STACK_CONFIG=<provider-name>
   # Add other API keys as needed
   ```

4. **Run Tests**
   ```bash
   # Run the test suite
   uv run pytest -v

   # Run with environment file
   uv run --env-file .env pytest -v
   ```

## 📋 How to Contribute

### Discussions → Issues → Pull Requests

We follow a structured contribution process:

1. **Have an idea or question?** → Open a [Discussion]
2. **Found a bug with reproduction steps?** → Open an [Issue]
3. **Ready to implement?** → Create a [Pull Request]

### Types of Contributions

- 🐛 **Bug Fixes** - Fix existing functionality
- ✨ **New Features** - Add new AI feature sizing capabilities
- 📚 **Documentation** - Improve or add documentation
- 🧪 **Testing** - Add or improve test coverage
- 🎨 **UI/UX** - Enhance user experience
- 🔧 **Infrastructure** - Improve development tools and processes

### Contribution Workflow

1. **Fork the Repository**
   ```bash
   git fork <repository-url>
   git clone <your-fork-url>
   cd rhoai-ai-feature-sizing
   ```

2. **Create a Feature Branch**
   ```bash
   git checkout -b feature/your-feature-name
   # or
   git checkout -b bugfix/issue-number
   ```

3. **Make Your Changes**
   - Follow our [coding standards](#coding-standards)
   - Add tests for new functionality
   - Update documentation as needed
   - Ensure all tests pass

4. **Commit Your Changes**
   ```bash
   git add .
   git commit -m "feat: add new feature estimation algorithm"
   ```

5. **Push and Create Pull Request**
   ```bash
   git push origin feature/your-feature-name
   ```

## 🎯 Coding Standards

### Python Code Style

- Follow [PEP 8](https://pep8.org/) style guidelines
- Use meaningful variable and function names
- Add docstrings to all public functions and classes
- Maximum line length: 88 characters (Black formatter)

### Commit Message Format

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

**Types:**
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `style:` - Code style changes (formatting, etc.)
- `refactor:` - Code refactoring
- `test:` - Adding or updating tests
- `chore:` - Maintenance tasks

**Examples:**
```bash
feat(estimation): add new ML-based sizing algorithm
fix(jira): resolve authentication timeout issue
docs: update API documentation for new endpoints
test(stages): add unit tests for refine_feature module
```

### Code Quality Tools

We use the following tools to maintain code quality:

```bash
# Code formatting with Black
uv run black .

# Import sorting with isort
uv run isort .

# Linting with flake8
uv run flake8 .

# Type checking with mypy
uv run mypy .

# Pre-commit hooks (recommended)
uv run pre-commit install
uv run pre-commit run --all-files
```

## 🧪 Testing Guidelines

### Running Tests

```bash
# Run all tests
uv run pytest

# Run specific test file
uv run pytest tests/test_estimation.py

# Run with coverage
uv run pytest --cov=src --cov-report=html

# Run integration tests
uv run pytest tests/integration/
```

### Writing Tests

- Write unit tests for all new functions and classes
- Include integration tests for Llama Stack interactions
- Use descriptive test names that explain what is being tested
- Mock external dependencies appropriately
- Aim for at least 80% code coverage

### Test Structure

```python
def test_feature_estimation_with_valid_input():
    """Test that feature estimation returns expected results with valid input."""
    # Arrange
    input_data = {...}
    expected_result = {...}
    
    # Act
    result = estimate_feature(input_data)
    
    # Assert
    assert result == expected_result
```

## 📚 Documentation Standards

### Documentation Updates

When contributing, please ensure:

1. **Update relevant documentation in `/docs`**
   - Add new features to appropriate guides
   - Update API documentation for new endpoints
   - Include examples and usage patterns

2. **Update `/docs/README.md`**
   - Add links to new documentation
   - Update the document status table

3. **Keep README.md current**
   - Update project overview if needed
   - Add new quick start steps

### Documentation Style

- Use clear, concise language
- Include code examples where helpful
- Use proper markdown formatting
- Add diagrams for complex workflows (using Mermaid when possible)
- Reference [Llama Stack documentation](https://llama-stack.readthedocs.io/en/latest/) for consistency

## 🔄 Development Workflow

### Setting Up Llama Stack

Follow the [Llama Stack Quickstart](https://llama-stack.readthedocs.io/en/latest/getting_started/index.html#step-1-install-and-setup):

1. **Install and setup**
   ```bash
   # Install uv (if not already installed)
   curl -LsSf https://astral.sh/uv/install.sh | sh
   
   # Run inference on a Llama model with Ollama
   ollama run llama3.2:3b --keepalive 60m
   ```

2. **Run Llama Stack server**
   ```bash
   INFERENCE_MODEL=llama3.2:3b uv run --with llama-stack llama stack build --template ollama --image-type venv --run
   ```

### Development Best Practices

1. **Keep branches focused** - One feature/fix per branch
2. **Write clear commit messages** - Use conventional commits format
3. **Test your changes** - Run tests before submitting PR
4. **Update documentation** - Keep docs current with changes
5. **Review your own PR** - Check diff before requesting review

### Working with Llama Stack Components

When developing features that interact with Llama Stack:

- Refer to the [Llama Stack API Reference](https://llama-stack.readthedocs.io/en/latest/references/api_reference.html)
- Use the official [Llama Stack Client](https://llama-stack.readthedocs.io/en/latest/references/llama_stack_client_python_reference.html)
- Follow [Llama Stack contributing guidelines](https://llama-stack.readthedocs.io/en/latest/contributing/index.html)

## ❓ Getting Help

### Resources

- 📖 [Project Documentation](./docs/README.md)
- 🚀 [Getting Started Guide](./docs/user-guide/getting-started.md)
- 🏗️ [Architecture Overview](./docs/architecture/overview.md)
- 🔧 [Development Setup](./docs/development/setup.md)
- 📚 [Llama Stack Documentation](https://llama-stack.readthedocs.io/en/latest/)

### Support Channels

- 💬 **GitHub Discussions** - For questions and ideas
- 🐛 **GitHub Issues** - For bug reports and feature requests
- 📧 **Maintainers** - For sensitive issues or security concerns

### Contribution Recognition

We value all contributions! Contributors will be:
- Listed in our contributors section
- Mentioned in release notes for significant contributions
- Given credit in relevant documentation

## 📄 License

By contributing to this project, you agree that your contributions will be licensed under the same license as the project.

---

Thank you for contributing to RHOAI AI Feature Sizing! 🙏

*For more detailed technical information, please refer to our [comprehensive documentation](./docs/README.md).*