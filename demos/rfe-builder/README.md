# RFE Builder - AI-Powered Workflow Platform

[![CI/CD Pipeline](https://github.com/jeremyeder/vTeam/actions/workflows/ci.yml/badge.svg)](https://github.com/jeremyeder/vTeam/actions/workflows/ci.yml)
[![Coverage](https://codecov.io/gh/jeremyeder/vTeam/branch/main/graph/badge.svg)](https://codecov.io/gh/jeremyeder/vTeam)
[![Python 3.10+](https://img.shields.io/badge/python-3.10+-blue.svg)](https://www.python.org/downloads/)

RFE Builder is an interactive Streamlit web application that guides Request for Enhancement (RFE) submissions through a structured 7-step council review process with AI-powered assistance and enterprise integration.

## 🚀 Features (Phase 1)

- **📊 Visual Workflow Management**: Interactive Mermaid diagram showing the complete RFE Council process
- **👥 Multi-Agent System**: 7 specialized agent roles with dedicated dashboards
- **📈 Progress Tracking**: Real-time status updates and step-by-step progression
- **🔄 State Management**: Persistent RFE data with comprehensive history tracking
- **📋 Role-Based Interfaces**: Customized dashboards for each workflow participant
- **✅ Comprehensive Testing**: Full test coverage with CI/CD pipeline

## 🏗️ Architecture

### Agent Roles

The RFE Builder implements a 7-agent workflow system:

- **📊 Parker (Product Manager)** - RFE prioritization and stakeholder communication
- **🏛️ Archie (Architect)** - Technical review and acceptance criteria validation
- **⭐ Stella (Staff Engineer)** - Completeness assessment and final approval
- **📋 Olivia (Product Owner)** - Information gathering and requirement clarification
- **👥 Lee (Team Lead)** - Impact assessment and resource planning
- **💻 Taylor (Team Member)** - Technical impact evaluation
- **🚀 Derek (Delivery Owner)** - Feature ticket creation and assignment

### Workflow Steps

1. **Prioritize RFE** (Parker) - Business impact and priority assessment
2. **Review RFE** (Archie) - Technical feasibility and architecture review
3. **Completeness Check** (Stella) - Requirements validation and gap analysis
4. **Acceptance Criteria** (Archie) - Final technical approval
5. **Accept/Reject Decision** (Stella) - Final disposition
6. **Communicate Assessment** (Parker) - Stakeholder notification
7. **Create Feature Ticket** (Derek) - Implementation planning and assignment

## 🔧 Installation

### Prerequisites

- Python 3.10 or higher
- pip package manager

### Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/jeremyeder/vTeam.git
   cd vTeam/demos/rfe-builder
   ```

2. **Create virtual environment**
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

4. **Run the application**
   ```bash
   streamlit run app.py
   ```

5. **Open in browser**
   - The app will automatically open at `http://localhost:8501`

## 📖 Usage

### Creating an RFE

1. Navigate to **"📝 Create RFE"** in the sidebar
2. Fill in the required fields:
   - **Title**: Brief descriptive title
   - **Description**: Detailed enhancement description
   - **Business Justification** (optional): Business value explanation
   - **Technical Requirements** (optional): Technical constraints
   - **Success Criteria** (optional): Implementation success metrics
3. Click **"Create RFE"** to submit

### Managing Workflow

1. **View Progress**: Use **"📊 Workflow Overview"** to see visual workflow status
2. **Agent Actions**: Access **"👥 Agent Dashboard"** to perform role-specific tasks
3. **Track RFEs**: Monitor all submissions in **"📈 RFE List"** with filtering options

### Agent-Specific Actions

Each agent role has specific capabilities:

- **Parker (PM)**: Prioritize new RFEs, communicate decisions to stakeholders
- **Archie (Architect)**: Review technical feasibility, validate acceptance criteria
- **Stella (Staff Engineer)**: Assess completeness, make final accept/reject decisions
- **Other Agents**: Specialized assessment and support functions

## 🧪 Testing

### Run Tests

```bash
# Run all tests
pytest

# Run with coverage
pytest --cov=data --cov=components --cov-report=html

# Run specific test categories
pytest tests/test_rfe_models.py -v
pytest tests/test_workflow.py -v
```

### Test Coverage

- **RFE Models**: Data structure validation, workflow state management
- **Workflow Components**: Step progression, agent assignment, status tracking
- **Integration**: Complete workflow simulation, boundary conditions

## 🔄 CI/CD Pipeline

The project includes comprehensive GitHub Actions workflows:

- **Continuous Integration**: Automated testing across Python 3.10 and 3.11
- **Code Quality**: Linting with flake8, type checking with mypy
- **Security Scanning**: Safety and bandit security analysis
- **Streamlit Validation**: App syntax and import testing
- **Build Artifacts**: Deployment package creation

## 📁 Project Structure

```
rfe-builder/
├── app.py                      # Main Streamlit application
├── data/
│   ├── __init__.py
│   └── rfe_models.py          # Data models and state management
├── components/
│   ├── __init__.py
│   └── workflow.py            # Workflow visualization components
├── pages/
│   └── parker_pm.py           # Agent-specific page (example)
├── tests/
│   ├── __init__.py
│   ├── test_rfe_models.py     # Model tests
│   └── test_workflow.py       # Workflow tests
├── .github/
│   └── workflows/
│       └── ci.yml             # CI/CD pipeline
├── requirements.txt           # Dependencies
└── README.md                  # This file
```

## 🔮 Roadmap

### Phase 2: Conversational Interface (Planned)
- AI-powered chat interface for RFE creation
- Natural language processing for requirement extraction
- Context-aware form generation
- Smart suggestions and auto-completion

### Phase 3: Enterprise Integration (Planned)
- Jira/GitHub Issues integration
- Bi-directional data synchronization
- Webhook support for real-time updates
- API gateway for third-party integrations

### Phase 4: Advanced Intelligence (Planned)
- Predictive analytics for RFE success rates
- Automated impact assessment
- Historical data analysis and insights
- Custom reporting and dashboards

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass (`pytest`)
6. Commit your changes (`git commit -m 'Add amazing feature'`)
7. Push to the branch (`git push origin feature/amazing-feature`)
8. Open a Pull Request

## 📄 License

This project is part of the vTeam repository and follows the same licensing terms.

## 🙋 Support

For questions or issues:
- Open an issue in the [vTeam repository](https://github.com/jeremyeder/vTeam/issues)
- Tag issues with `rfe-builder` for faster response

## 🎯 Phase 1 Success Criteria

- [x] ✅ Basic workflow functional with all agent roles
- [x] ✅ Visual workflow matches mermaid diagram
- [x] ✅ RFE state persistence across sessions
- [x] ✅ Comprehensive test coverage (>80%)
- [x] ✅ CI/CD pipeline with automated testing
- [x] ✅ Agent-specific interfaces functional
- [x] ✅ Step progression and status tracking working

---

**Built with ❤️ using Streamlit and Python**
