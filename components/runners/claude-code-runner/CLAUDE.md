# Ambient Agentic Runner Project

## Project Overview
This is an automated agentic system that uses Ambient Code AI CLI with spek-kit spec-driven development to perform comprehensive tasks including general analysis, coding assistance, data processing, and specification creation.

## Key Components
- **Python Runner**: Orchestrates the agentic session and handles status updates
- **AI CLI**: Executes tasks using Claude Code capabilities
- **Spek-kit Integration**: Enables spec-driven development with `/specify`, `/plan`, and `/tasks` commands
- **Backend Integration**: Reports progress and results to Kubernetes agentic session API

## Agentic Capabilities

### Spec-Driven Development (spek-kit)
The runner supports spec-driven development workflows with these commands:
- **`/specify [requirements]`**: Create comprehensive feature specifications from natural language requirements
- **`/plan [tech details]`**: Generate detailed implementation plans with architecture and tech stack decisions
- **`/tasks [implementation notes]`**: Break down features into actionable development tasks with effort estimates

## Instructions for Sessions

### Standard Agentic Sessions
When executing general agentic tasks:
1. **Understand the request** - parse the prompt and identify task requirements
2. **Provide comprehensive analysis** - thorough responses aligned with task objectives
3. **Include actionable insights** - practical recommendations and solutions
4. **Handle various domains** - coding, analysis, documentation, planning, etc.

### Spec-Driven Development Sessions
When using spek-kit commands:
1. **Start with /specify** - create the feature specification first
2. **Follow with /plan** - define technical implementation approach
3. **Complete with /tasks** - break down into actionable development tasks
4. **Review generated artifacts** - specifications, plans, and task breakdowns are automatically created
5. **Enhance with Claude Code** - the AI will improve and elaborate on generated content

## Technical Notes
- Container runs AI CLI with spek-kit integration
- Spek-kit workspace created in `/tmp/spek-workspace` for each session
- Direct prompt passing eliminates temporary file creation
- Timeout handling: 5-minute default per agentic session
- Generated specifications, plans, and tasks returned as session artifacts

## Example Usage

### General Analysis
```
Prompt: "Review this code for security vulnerabilities and suggest improvements"
Result: Comprehensive code analysis with security recommendations
```

### Spec-Driven Development
```
Prompt: "/specify Build a user authentication system with email/password login, social auth, and password reset functionality"
Result: Complete specification document with user stories, requirements, and acceptance criteria

Prompt: "/plan Use Node.js with Express, PostgreSQL database, and React frontend. Include JWT for authentication and SendGrid for emails"
Result: Detailed implementation plan with architecture, phases, and technical decisions

Prompt: "/tasks Focus on the backend API implementation first, then frontend components"
Result: Granular task breakdown with effort estimates and dependencies
```
