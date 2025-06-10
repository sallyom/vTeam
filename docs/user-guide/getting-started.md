# Getting Started with RHOAI AI Feature Sizing

Welcome! This guide will help you get up and running with the RHOAI AI Feature Sizing tool quickly. This tool uses [Llama Stack](https://llama-stack.readthedocs.io/en/latest/) to provide AI-powered feature estimation and JIRA integration.

## 🚀 Quick Start

### Prerequisites

Before you begin, ensure you have:

- **Python 3.12+** installed
- **Git** for version control
- **uv** package manager ([installation guide](https://docs.astral.sh/uv/getting-started/installation/))
- **Ollama** for local AI models ([installation guide](https://ollama.com/download))

### 1. Installation

```bash
# Clone the repository
git clone <repository-url>
cd rhoai-ai-feature-sizing

# Install dependencies
uv sync
uv pip install -e .

# Activate virtual environment
source .venv/bin/activate
```

### 2. Set Up Llama Stack

Following the [Llama Stack Quickstart](https://llama-stack.readthedocs.io/en/latest/getting_started/index.html#step-1-install-and-setup):

```bash
# 1. Install uv (if not already installed)
curl -LsSf https://astral.sh/uv/install.sh | sh

# 2. Run inference on a Llama model with Ollama
ollama run llama3.2:3b --keepalive 60m
```

### 3. Start Llama Stack Server

```bash
# Run the Llama Stack server with Ollama provider
INFERENCE_MODEL=llama3.2:3b uv run --with llama-stack llama stack build --template ollama --image-type venv --run
```

This will start the Llama Stack server at `http://localhost:8321`.

### 4. Configure Environment

Create a `.env` file in the project root:

```bash
# Llama Stack Configuration
LLAMA_STACK_BASE_URL=http://localhost:8321
LLAMA_STACK_CLIENT_LOG=debug
LLAMA_STACK_PORT=8321
LLAMA_STACK_CONFIG=ollama

# Optional: JIRA Integration
JIRA_BASE_URL=https://your-domain.atlassian.net
JIRA_USERNAME=your-email@example.com
JIRA_API_TOKEN=your-api-token

# Optional: Additional API Keys
TAVILY_SEARCH_API_KEY=your-key-here
BRAVE_SEARCH_API_KEY=your-key-here
```

### 5. Run Your First Feature Estimation

```bash
# Run the main application
python main.py
```

## 🎯 Basic Usage

### Command Line Interface

The tool provides a command-line interface for feature sizing:

```bash
# Basic feature refinement
python -m stages.refine_feature "Add user authentication to the mobile app"

# Run complete estimation pipeline
python main.py --feature "Implement real-time chat functionality"

# Generate JIRA drafts
python -m stages.draft_jiras --feature-id "FEAT-001"
```

### Python API Usage

You can also use the tool programmatically:

```python
from llama_stack_client import LlamaStackClient
from stages.refine_feature import refine_feature
from stages.estimate import estimate_feature

# Initialize Llama Stack client
client = LlamaStackClient(base_url="http://localhost:8321")

# Refine a feature description
feature_description = "Add user dashboard with analytics"
refined_feature = refine_feature(client, feature_description)

# Get size estimate
estimate = estimate_feature(client, refined_feature)

print(f"Estimated effort: {estimate['story_points']} story points")
print(f"Confidence: {estimate['confidence']}%")
```

## 🔧 Configuration

### Llama Stack Configuration

The application uses Llama Stack for AI processing. You can configure different aspects:

```bash
# Use different models
INFERENCE_MODEL=llama3.1:8b uv run --with llama-stack llama stack build --template ollama --image-type venv --run

# Configure logging levels
export LLAMA_STACK_LOGGING=server=debug;core=info

# Set log file
export LLAMA_STACK_LOG_FILE=server.log
```

### Application Configuration

Create a `config.json` file for application-specific settings:

```json
{
  "estimation": {
    "default_confidence_threshold": 80,
    "max_story_points": 13,
    "complexity_factors": ["technical", "business", "integration"]
  },
  "jira": {
    "default_project": "PROJ",
    "default_issue_type": "Story",
    "auto_assign": false
  },
  "prompts": {
    "refinement_template": "prompts/refine_feature.md",
    "estimation_template": "prompts/estimate_feature.md"
  }
}
```

## 📝 Example Workflows

### Workflow 1: Basic Feature Estimation

```bash
# Step 1: Start with a rough feature description
FEATURE="Add social login options (Google, Facebook, GitHub) to registration"

# Step 2: Refine the feature
python -m stages.refine_feature "$FEATURE"

# Step 3: Get estimation
python -m stages.estimate --refined-feature-file "output/refined_feature.json"

# Step 4: Generate JIRA tickets
python -m stages.draft_jiras --estimation-file "output/estimation.json"
```

### Workflow 2: Batch Processing

```bash
# Process multiple features from a file
python main.py --batch-file "features.txt" --output-dir "results/"
```

Where `features.txt` contains:
```
Implement user profile management
Add email notification system
Create admin dashboard
Integrate payment gateway
```

### Workflow 3: Interactive Mode

```bash
# Start interactive session
python main.py --interactive

# Follow prompts to:
# 1. Describe your feature
# 2. Review refined description
# 3. Confirm estimation parameters
# 4. Generate deliverables
```

## 🔍 Understanding the Output

### Feature Refinement Output

```json
{
  "original_description": "Add social login",
  "refined_description": "Implement OAuth2-based social login integration...",
  "acceptance_criteria": [
    "Users can log in with Google OAuth2",
    "Users can log in with Facebook OAuth2",
    "Error handling for failed authentication",
    "Redirect to appropriate page after login"
  ],
  "technical_requirements": [
    "OAuth2 client configuration",
    "User account linking logic",
    "Security considerations",
    "Database schema updates"
  ],
  "dependencies": [
    "User management system",
    "Database migration framework"
  ]
}
```

### Estimation Output

```json
{
  "story_points": 8,
  "confidence": 85,
  "complexity_factors": {
    "technical": "medium",
    "business": "low", 
    "integration": "high"
  },
  "estimated_hours": 32,
  "risk_factors": [
    "Third-party OAuth provider changes",
    "User account merging complexity"
  ],
  "recommendations": [
    "Start with Google OAuth2 implementation",
    "Plan for comprehensive testing of edge cases"
  ]
}
```

## 🛠️ Troubleshooting

### Common Issues

**1. Llama Stack Server Not Starting**
```bash
# Check if Ollama is running
ollama list

# Verify model is available
ollama run llama3.2:3b

# Check port availability
lsof -i :8321
```

**2. Model Not Found**
```bash
# Pull the required model
ollama pull llama3.2:3b

# Or use a different model
INFERENCE_MODEL=llama3.1:8b ollama run llama3.1:8b
```

**3. Import Errors**
```bash
# Reinstall dependencies
uv sync --all-extras

# Check Python path
python -c "import sys; print(sys.path)"
```

**4. JIRA Integration Issues**
```bash
# Test JIRA connectivity
curl -u username:token https://your-domain.atlassian.net/rest/api/2/myself

# Verify API token permissions
```

### Performance Tips

1. **Model Performance**
   - Use GPU acceleration if available
   - Consider smaller models for faster responses
   - Cache model responses for repeated queries

2. **Batch Processing**
   - Process multiple features together
   - Use async processing for large batches
   - Monitor memory usage with large datasets

3. **Network Optimization**
   - Use local Ollama for development
   - Configure connection pooling for production
   - Implement retry logic for API calls

## 📚 Next Steps

Now that you're up and running:

1. **Explore Advanced Features**
   - [API Documentation](../api/endpoints.md) - Integrate with other systems
   - [Architecture Overview](../architecture/overview.md) - Understand the system design

2. **Customize for Your Team**
   - [Development Setup](../development/setup.md) - Set up development environment
   - [Configuration Guide](../deployment/configuration.md) - Advanced configuration options

3. **Get Help**
   - [FAQ](./faq.md) - Common questions and answers
   - [Contributing Guide](../../CONTRIBUTING.md) - Contribute to the project

## 🎉 Success!

You're now ready to start using RHOAI AI Feature Sizing for your project estimation needs! The tool will help you:

- 🔍 **Refine** vague feature descriptions into detailed specifications
- 📊 **Estimate** development effort with AI-powered analysis
- 📋 **Generate** structured JIRA tickets for project management
- 🔄 **Iterate** on estimations as requirements evolve

For more advanced usage patterns and configuration options, continue reading the rest of our documentation.

---

*Having issues? Check our [FAQ](./faq.md) or [open an issue](https://github.com/your-repo/issues) for help.*