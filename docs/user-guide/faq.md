# Frequently Asked Questions (FAQ)

This document answers common questions about the RHOAI AI Feature Sizing tool.

## 🚀 Getting Started

### Q: What is RHOAI AI Feature Sizing?

**A:** RHOAI AI Feature Sizing is an AI-powered tool that helps development teams estimate the effort required for software features. It uses [Llama Stack](https://llama-stack.readthedocs.io/en/latest/) to:
- Refine vague feature descriptions into detailed specifications
- Estimate development effort using AI analysis
- Generate structured JIRA tickets for project management
- Provide confidence levels and risk assessments

### Q: What are the system requirements?

**A:** To run the tool, you need:
- **Python 3.12+** 
- **4GB+ RAM** (8GB+ recommended for better model performance)
- **2GB+ disk space** for models and dependencies
- **Internet connection** for initial setup and model downloads
- **Optional**: GPU for faster AI inference

### Q: How do I install the tool?

**A:** Follow these steps:

```bash
# Clone the repository
git clone <repository-url>
cd rhoai-ai-feature-sizing

# Install dependencies with uv
uv sync
uv pip install -e .

# Set up Ollama and Llama Stack
ollama run llama3.2:3b --keepalive 60m
INFERENCE_MODEL=llama3.2:3b uv run --with llama-stack llama stack build --template ollama --image-type venv --run
```

See the [Getting Started Guide](./getting-started.md) for detailed instructions.

## 🤖 AI and Models

### Q: Which AI models does the tool use?

**A:** The tool supports various Llama models through Ollama:
- **Llama 3.2 3B** - Fast, good for development and testing
- **Llama 3.1 8B** - Balanced performance and quality
- **Llama 3.1 70B** - Highest quality but requires more resources

You can configure the model using:
```bash
INFERENCE_MODEL=llama3.1:8b ollama run llama3.1:8b
```

### Q: Can I use other AI providers besides Ollama?

**A:** Yes! Llama Stack supports multiple providers:
- **Ollama** - Local model serving (recommended for development)
- **Together AI** - Cloud-hosted models
- **Fireworks AI** - High-performance inference
- **NVIDIA TensorRT-LLM** - Optimized inference
- **Custom providers** - Implement your own

See the [Llama Stack Providers documentation](https://llama-stack.readthedocs.io/en/latest/references/providers/index.html) for details.

### Q: How accurate are the estimations?

**A:** Estimation accuracy depends on several factors:
- **Input quality**: More detailed descriptions lead to better estimates
- **Model size**: Larger models generally provide more accurate estimates
- **Domain context**: The tool learns from patterns in software development
- **Team calibration**: Results improve when calibrated against team velocity

Typical accuracy ranges:
- ±1-2 story points for well-defined features
- ±2-3 story points for complex or vague features
- 75-85% confidence for most estimates

### Q: Can the tool learn from our team's historical data?

**A:** Currently, the tool uses general software development patterns. Future versions will support:
- Team-specific calibration data
- Historical estimation accuracy tracking
- Custom complexity factors
- Project-specific estimation models

## 🔧 Configuration and Usage

### Q: How do I configure the tool for my team?

**A:** Create a `config.json` file:

```json
{
  "estimation": {
    "default_confidence_threshold": 80,
    "max_story_points": 13,
    "complexity_factors": ["technical", "business", "integration"]
  },
  "jira": {
    "default_project": "YOUR_PROJECT",
    "default_issue_type": "Story",
    "auto_assign": false
  }
}
```

Also set up environment variables in `.env`:
```bash
LLAMA_STACK_BASE_URL=http://localhost:8321
JIRA_BASE_URL=https://your-domain.atlassian.net
JIRA_USERNAME=your-email@example.com
JIRA_API_TOKEN=your-api-token
```

### Q: What input formats are supported?

**A:** The tool accepts:
- **Plain text descriptions**: "Add user authentication"
- **Structured feature specs**: JSON with acceptance criteria
- **Batch files**: Multiple features in text files
- **Interactive input**: Command-line prompts
- **API calls**: RESTful endpoints for integration

Example structured input:
```json
{
  "title": "User Authentication",
  "description": "Implement OAuth2 login",
  "acceptance_criteria": [
    "Users can log in with Google",
    "Session management"
  ],
  "constraints": ["Must integrate with existing user DB"]
}
```

### Q: How do I integrate with JIRA?

**A:** Set up JIRA integration:

1. **Get API credentials**:
   - Go to Atlassian Account Settings
   - Create an API token
   - Note your JIRA base URL

2. **Configure environment**:
   ```bash
   JIRA_BASE_URL=https://your-domain.atlassian.net
   JIRA_USERNAME=your-email@example.com
   JIRA_API_TOKEN=your-api-token
   ```

3. **Test connection**:
   ```bash
   python -m tools.mcp_jira --test-connection
   ```

4. **Generate tickets**:
   ```bash
   python -m stages.draft_jiras --feature-file "feature.json"
   ```

### Q: Can I customize the AI prompts?

**A:** Yes! Edit the prompt templates in the `prompts/` directory:

- `refine_feature.md` - Feature refinement prompts
- `estimate_feature.md` - Estimation prompts (when implemented)
- `jira_template.md` - JIRA ticket formatting

Example prompt customization:
```markdown
# Feature Refinement Prompt

Please analyze this feature description and provide:
1. Detailed technical requirements
2. Acceptance criteria
3. Risk factors
4. Dependencies

Feature: {feature_description}

Focus on these aspects for our team:
- Security considerations
- Performance impact
- Integration complexity
```

## 🔍 Troubleshooting

### Q: The Llama Stack server won't start. What should I do?

**A:** Try these troubleshooting steps:

1. **Check Ollama status**:
   ```bash
   ollama list
   ollama ps
   ```

2. **Verify model availability**:
   ```bash
   ollama pull llama3.2:3b
   ollama run llama3.2:3b
   ```

3. **Check port availability**:
   ```bash
   lsof -i :8321
   # Kill conflicting processes if needed
   ```

4. **Review logs**:
   ```bash
   export LLAMA_STACK_LOG_FILE=debug.log
   export LLAMA_STACK_LOGGING=all=debug
   ```

### Q: I'm getting import errors. How do I fix them?

**A:** Common solutions:

1. **Reinstall dependencies**:
   ```bash
   uv sync --all-extras
   uv pip install -e .
   ```

2. **Check Python version**:
   ```bash
   python --version  # Should be 3.12+
   ```

3. **Verify virtual environment**:
   ```bash
   source .venv/bin/activate
   which python
   ```

4. **Clear cache**:
   ```bash
   uv cache clean
   pip cache purge
   ```

### Q: The estimations seem inaccurate. How can I improve them?

**A:** Tips for better estimations:

1. **Provide detailed descriptions**:
   - Include technical context
   - Specify acceptance criteria
   - Mention constraints and dependencies

2. **Use larger models**:
   ```bash
   INFERENCE_MODEL=llama3.1:8b ollama run llama3.1:8b
   ```

3. **Calibrate against known work**:
   - Compare estimates with completed features
   - Adjust complexity factors in configuration

4. **Iterative refinement**:
   - Run refinement multiple times
   - Add context from initial estimates

### Q: JIRA integration isn't working. What's wrong?

**A:** Common JIRA issues:

1. **Check credentials**:
   ```bash
   curl -u username:token https://your-domain.atlassian.net/rest/api/2/myself
   ```

2. **Verify permissions**:
   - API token needs project access
   - User must have create issue permissions

3. **Check project configuration**:
   - Verify project key exists
   - Confirm issue types are available

4. **Test with simple API call**:
   ```bash
   curl -X GET \
     -H "Accept: application/json" \
     -u email:token \
     "https://your-domain.atlassian.net/rest/api/2/project"
   ```

## 📊 Understanding Results

### Q: What do the story point estimates mean?

**A:** Our story point scale follows common agile practices:

- **1-2 points**: Simple tasks, minimal complexity
- **3-5 points**: Standard features with known patterns
- **8 points**: Complex features requiring research or integration
- **13+ points**: Epics that should be broken down further

The tool also provides:
- **Confidence percentage**: How certain the estimate is
- **Risk factors**: Potential complications
- **Complexity breakdown**: Technical, business, and integration factors

### Q: How should I interpret confidence levels?

**A:** Confidence levels indicate estimation reliability:

- **90-100%**: High confidence, well-understood features
- **75-89%**: Good confidence, some unknowns exist
- **60-74%**: Medium confidence, significant unknowns
- **Below 60%**: Low confidence, needs more analysis

**Recommendations by confidence level**:
- High: Proceed with estimate
- Medium: Consider additional research
- Low: Break down feature further or spike first

### Q: What are complexity factors?

**A:** The tool analyzes three complexity dimensions:

1. **Technical Complexity**:
   - New technologies or frameworks
   - Performance requirements
   - Code architecture changes

2. **Business Complexity**:
   - Unclear or changing requirements
   - Multiple stakeholder approval
   - Complex business logic

3. **Integration Complexity**:
   - External API dependencies
   - Cross-team coordination
   - Legacy system integration

Each factor is rated as Low, Medium, or High and influences the final estimate.

## 🚀 Advanced Usage

### Q: Can I run the tool in production environments?

**A:** Yes, with appropriate setup:

1. **Use production-grade models**:
   - Deploy Llama Stack on dedicated servers
   - Consider cloud providers for scalability
   - Implement load balancing for high availability

2. **Security considerations**:
   - Secure API endpoints with authentication
   - Encrypt sensitive feature descriptions
   - Implement audit logging

3. **Performance optimization**:
   - Use GPU acceleration
   - Configure model caching
   - Implement request queuing

See [Deployment Documentation](../deployment/installation.md) for details.

### Q: How do I integrate this with my existing tools?

**A:** Integration options:

1. **REST API**: Call endpoints programmatically
2. **Python library**: Import and use directly
3. **CLI wrapper**: Shell scripts around command-line interface
4. **Webhooks**: Trigger estimations from other systems
5. **CI/CD integration**: Automated estimation in deployment pipelines

Example API integration:
```python
import requests

response = requests.post(
    "http://localhost:8000/api/estimate",
    json={"feature": "Add user notifications"}
)
estimate = response.json()
```

### Q: Can I contribute to the project?

**A:** Absolutely! We welcome contributions:

1. **Read the [Contributing Guide](../../CONTRIBUTING.md)**
2. **Check open issues** for areas needing help
3. **Join discussions** for feature planning
4. **Submit pull requests** with improvements

Common contribution areas:
- New estimation algorithms
- Additional tool integrations
- Documentation improvements
- Bug fixes and optimizations

## 📞 Getting Help

### Q: Where can I get more help?

**A:** Support resources:

- **📖 Documentation**: [docs/README.md](../README.md)
- **🐛 Bug Reports**: GitHub Issues
- **💡 Feature Requests**: GitHub Discussions
- **🤝 Community**: Project Discord/Slack (if available)
- **📧 Direct Contact**: Maintainer email (if provided)

### Q: How do I report bugs or request features?

**A:** Follow this process:

1. **Search existing issues** to avoid duplicates
2. **For bugs**: Provide reproduction steps and environment details
3. **For features**: Describe the use case and expected behavior
4. **Include logs** and configuration details when relevant

**Bug report template**:
```
**Environment**: OS, Python version, model used
**Steps to reproduce**: 1. 2. 3.
**Expected behavior**: What should happen
**Actual behavior**: What actually happens
**Logs**: Relevant error messages
```

---

*Don't see your question? [Open a discussion](https://github.com/your-repo/discussions) or [submit an issue](https://github.com/your-repo/issues) and we'll help you out!*
