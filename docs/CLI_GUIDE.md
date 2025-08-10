# CLI Reference Guide

Complete command-line interface documentation for the RHOAI AI Feature Sizing system. This guide covers all CLI commands, options, and usage patterns for both development and production environments.

## 🔧 Setup

1. **Configure environment variables:**
   ```bash
   # Copy the template file
   cp env.template .env
   
   # Edit with your settings
   nano .env  # or your preferred editor
   ```
   
   **Required variables in .env:**
   ```bash
   INFERENCE_MODEL="meta-llama/Llama-3.2-3B-Instruct"
   LLAMA_STACK_URL="http://your-llama-stack-server:8321"
   MCP_ATLASSIAN_URL="ws://your-mcp-server:3001/mcp"
   CONFIGURE_TOOLGROUPS="true"
   SQLITE_DB_PATH="./rhoai_sessions.db"
   ```

2. **Install dependencies** (if not already done):
   ```bash
   uv sync  # or pip install -e .
   ```

## 🎯 Quick Start

### Plan a Feature (Autonomous Mode)
```bash
# Simple planning
./plan-feature.sh RHOAIENG-12345

# Or use the full CLI
python cli_agent.py plan RHOAIENG-12345
```

### Advanced Planning Options
```bash
# Custom settings
python cli_agent.py plan RHOAIENG-12345 \
  --rag-stores rhoai_docs patternfly_docs \
  --max-turns 15 \
  --output-dir ./outputs

# Disable validation
python cli_agent.py plan RHOAIENG-12345 --no-validation
```

### Interactive Chat
```bash
# Start a new chat session
python cli_agent.py chat RHOAIENG-12345

# Continue an existing session
python cli_agent.py chat RHOAIENG-12345 --session-id cli-20241201-143022
```

### List Available RAG Stores
```bash
python cli_agent.py list-stores
```

## 📋 Commands

### `plan` - Autonomous Feature Planning
Runs the complete autonomous planning loop:
1. Fetches JIRA issue details
2. Researches components using RAG
3. Creates refinement document
4. Generates JIRA epics and stories
5. Validates plan coverage
6. Saves everything to database

**Options:**
- `--rag-stores STORE1 STORE2` - Specify RAG stores to use
- `--max-turns N` - Maximum agent turns (default: 12)
- `--no-validation` - Skip final validation
- `--output-dir DIR` - Save outputs to files

### `chat` - Interactive Mode
Start an interactive chat session with the agent. Useful for:
- Refining existing plans
- Asking questions about the feature
- Iterative improvements

**Chat Commands:**
- `help` - Show available commands
- `status` - Show current session state
- `refinement` - Display current refinement document
- `jira` - Display current JIRA plan
- `quit`/`exit` - End session

### `list-stores` - Show RAG Stores
Lists available RAG stores for context research.

## 🎛️ How It Works

### Autonomous Planning Flow
```
1. 🔍 Fetch JIRA → Extract components & context
2. 🧠 Agent Loop → Research, plan, create, save (up to max-turns)
3. ✅ Validation → Check refinement/plan coverage
4. 💾 Database → All outputs saved automatically
5. 📄 Results → Display and optionally save to files
```

### Database Integration
- All outputs are automatically saved to the database
- Refinement docs stored in `outputs` table
- JIRA plans stored as both JSON snapshots and normalized `epics`/`stories`
- Session management with UUIDs

### Custom Tools
The agent uses custom Llama Stack tools to persist work:
- `get_refinement_doc(session_uuid, jira_key)`
- `set_refinement_doc(session_uuid, jira_key, content)`
- `get_jira_plan(session_uuid, jira_key)`
- `set_jira_plan(session_uuid, jira_key, plan_json)`
- `patch_jira_plan(session_uuid, jira_key, json_patch_ops)`

## 📊 Example Output

```
🚀 Starting autonomous planning for RHOAIENG-12345
   Max turns: 12
   Validation: enabled
   RAG stores: default

🤖 Agent is analyzing the JIRA issue and creating the plan...
   (This may take several minutes)

============================================================
🎉 PLANNING COMPLETED!
============================================================

📋 REFINEMENT DOCUMENT:
----------------------------------------
# Refinement Doc
## Problem Statement
Enable multi-tenancy in the model registry...

## Implementation Plan
- Add tenant_id to all model entries
- Update REST APIs with tenant scope...

🎯 JIRA PLAN:
----------------------------------------
1. Epic: Enable multi-tenancy in Registry
   Component: model-registry
   Stories (3):
     1. Add tenant_id to models DB schema
     2. Update /models API to accept tenant_id parameter
     3. Write integration tests for tenant flows

✅ VALIDATION NOTES:
----------------------------------------
The plan covers all major acceptance criteria...

🔧 Actions taken: looped_planning

💾 DATABASE STATE:
----------------------------------------
Refinement in DB: ✅
JIRA plan in DB: ✅
Epics: 1, Stories: 3

✨ Planning completed successfully!
```

## 🐛 Troubleshooting

### Common Issues

1. **Import Errors**
   ```bash
   # Make sure you're in the project root
   cd /path/to/rhoai-ai-feature-sizing
   python cli_agent.py plan JIRA-KEY
   ```

2. **Missing Environment Variables**
   ```bash
   # Make sure you have a .env file with required variables
   cp env.template .env
   # Edit .env with your actual values
   
   # Or export directly (not recommended for permanent use)
   export INFERENCE_MODEL="your-model-name"
   export LLAMA_STACK_URL="http://localhost:8321"
   ```

3. **Database Connection Issues**
   - Check your database URL in environment variables
   - Ensure database tables are created

4. **Agent Timeout/Max Turns**
   - Increase `--max-turns` if the agent needs more time
   - Check Llama Stack server connectivity

### Debugging
- Add `--verbose` flag for detailed logging (if implemented)
- Check agent session logs in the database
- Use `chat` mode for interactive debugging

## 🚀 OpenShift Deployment

For OpenShift environments, make sure:
1. All environment variables are set in your deployment config
2. Database connection is configured properly
3. Llama Stack server is accessible
4. MCP Atlassian server is running and configured

```bash
# In OpenShift pod
python cli_agent.py plan RHOAIENG-12345 --output-dir /tmp/outputs
```

## 💡 Tips

- Use `chat` mode to refine plans after initial autonomous planning
- Save outputs with `--output-dir` for sharing with team members
- Start with default RAG stores, then customize based on your components
- Monitor agent turns - if it hits max-turns frequently, the issue might be complex

---

**Happy Feature Planning! 🎉**
