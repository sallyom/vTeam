# Lab 1: Create Your First RFE

## Objective 🎯

Learn to create a Request for Enhancement (RFE) using vTeam's conversational AI interface and understand how the 7-agent council processes your requirements.

**By the end of this lab, you will:**
- Successfully create an RFE using natural language
- Understand the agent workflow stages  
- Interpret agent analysis and recommendations
- Generate implementation-ready requirements

## Prerequisites 📋

- [ ] vTeam installed and running locally ([Getting Started Guide](../../user-guide/getting-started.md))
- [ ] OpenAI and Anthropic API keys configured in `src/.env`
- [ ] Basic understanding of software requirements
- [ ] Web browser for accessing the LlamaIndex chat interface

## Estimated Time ⏱️

**30-45 minutes** (including agent processing time)

## Lab Scenario

You're a Product Manager at a software company. Your development team has been asking for a **dark mode feature** to improve user experience and reduce eye strain during late-night coding sessions. You need to create a comprehensive RFE that the engineering team can implement immediately.

## Step 1: Access the Chat Interface

1. **Ensure vTeam is running**. If not, start it:
   ```bash
   cd demos/rfe-builder
   
   # Terminal 1: Start API server
   uv run -m llama_deploy.apiserver
   
   # Terminal 2: Deploy workflow
   uv run llamactl deploy deployment.yml
   ```

2. **Open your browser** to `http://localhost:4501/deployments/rhoai-ai-feature-sizing/ui`

3. **Verify the chat interface**:
   - You should see a modern LlamaIndex chat interface
   - Look for starter questions or prompts
   - The interface should be ready to accept your input

**✅ Checkpoint**: Confirm you can see the chat interface and it's responsive to input.

## Step 2: Initiate RFE Creation

Now let's create your first RFE using natural language.

1. **Start with a basic description** in the chat:
   ```
   I want to add a dark mode toggle to our application. Users should be able to switch between light and dark themes, and their preference should be saved.
   ```

2. **Send the message** and wait for the AI response

3. **Observe the AI's follow-up questions** - the system will ask clarifying questions like:
   - What type of application is this?
   - Where should the toggle be located?
   - Are there any specific design requirements?

**✅ Checkpoint**: The LlamaDeploy workflow should begin processing and respond within 10-15 seconds.

## Step 3: Provide Additional Context

The AI will guide you through refining your requirements. Respond to its questions with details like:

**When asked about application type:**
```
This is a web-based project management application built with React. We have about 5,000 active users who work in different time zones.
```

**When asked about toggle placement:**
```
The toggle should be in the user settings page, but also accessible from the main navigation bar for quick switching.
```

**When asked about design requirements:**
```
We want to follow our existing design system. Dark mode should use our brand colors - dark gray (#2D3748) backgrounds with white text, and our signature blue (#3182CE) for accents.
```

**✅ Checkpoint**: The multi-agent workflow will automatically process your input without requiring back-and-forth exchanges.

## Step 4: Review Generated RFE

The AI will present a structured RFE with sections like:

- **Title**: Clear, actionable feature name
- **Description**: Detailed feature explanation  
- **Business Justification**: Why this feature matters
- **Acceptance Criteria**: Specific, testable requirements
- **Technical Considerations**: Implementation notes

**Review the generated content and verify:**
- [ ] Title accurately reflects your request
- [ ] Description captures all discussed details
- [ ] Business justification makes sense for your user base
- [ ] Acceptance criteria are specific and measurable

**✅ Checkpoint**: The generated RFE should be comprehensive and ready for engineering review.

## Step 5: Watch Multi-Agent Analysis

The LlamaDeploy workflow automatically orchestrates all 7 agents:

1. **Monitor the progress** in real-time
2. **Observe agent coordination**:
   - All 7 agents analyze your RFE simultaneously
   - LlamaDeploy orchestrates the workflow execution
   - Real-time streaming shows agent progress
3. **Watch for specialized analysis** from each agent perspective

**The 7-agent process:**
1. **Parker (PM)**: Prioritizes business value and stakeholder impact
2. **Archie (Architect)**: Evaluates technical feasibility and design approach
3. **Stella (Staff Engineer)**: Reviews implementation complexity and completeness  
4. **Archie (Architect)**: Refines acceptance criteria for testability
5. **Stella (Staff Engineer)**: Makes final accept/reject recommendation
6. **Parker (PM)**: Communicates decision and next steps
7. **Derek (Delivery Owner)**: Creates implementation tickets and timeline

**✅ Checkpoint**: All 7 agents should process your RFE within 2-3 minutes.

## Step 6: Analyze Agent Results

Each agent provides specialized analysis. Review their outputs:

### **Parker (PM) Analysis**
- Business value assessment (1-10 scale)
- User impact evaluation  
- Resource requirement estimates
- Stakeholder communication recommendations

### **Archie (Architect) Analysis**  
- Technical feasibility score
- Architecture impact assessment
- Integration points identified
- Risk factors and mitigation strategies

### **Stella (Staff Engineer) Analysis**
- Implementation complexity rating
- Development time estimates
- Required skills and resources
- Quality assurance considerations

**✅ Checkpoint**: Each agent should provide relevant, role-specific insights about your dark mode RFE.

## Step 7: Interpret Recommendations

Based on the agent analysis, you should see:

**Positive Indicators:**
- High business value score (7-9/10)
- Low-to-medium technical complexity
- Clear implementation path
- Strong user benefit justification

**Potential Concerns:**
- Design system impact
- Testing requirements for multiple themes
- Browser compatibility considerations
- Performance implications

**✅ Checkpoint**: The overall recommendation should be positive with actionable next steps.

## Step 8: Generate Implementation Artifacts

If the RFE is accepted, Derek (Delivery Owner) will create:

- **Epic**: High-level feature description
- **User Stories**: Specific implementation tasks
- **Acceptance Criteria**: Detailed testing requirements  
- **Implementation Timeline**: Development phases and milestones

**Review these artifacts for:**
- [ ] Clear, actionable user stories
- [ ] Testable acceptance criteria
- [ ] Realistic timeline estimates
- [ ] Proper story point estimates

**✅ Checkpoint**: Implementation artifacts should be ready for sprint planning.

## Validation & Testing

### Test Your Understanding

**Question 1**: What was Parker's business value score for your RFE, and why?

**Question 2**: Which technical risks did Archie identify, and how can they be mitigated?

**Question 3**: What was Stella's complexity rating, and does it align with your expectations?

### Verify the RFE Quality

A well-refined RFE should have:
- [ ] **Specific title** that clearly communicates the feature
- [ ] **Detailed description** with user context and motivation
- [ ] **Quantified business justification** with user impact metrics
- [ ] **Measurable acceptance criteria** that can be tested
- [ ] **Technical considerations** for implementation planning
- [ ] **Clear timeline** with realistic milestones

## Troubleshooting 🛠️

### Agent Analysis Takes Too Long
- **Cause**: High API usage or network issues
- **Solution**: Check your internet connection and Anthropic API status
- **Workaround**: Try during off-peak hours

### Unclear Agent Recommendations  
- **Cause**: Insufficient initial requirements
- **Solution**: Provide more context about your application, users, and constraints
- **Tip**: Include technical stack, user base size, and business priorities

### RFE Rejected by Agents
- **Cause**: Low business value, high complexity, or unclear requirements
- **Solution**: Refine your requirements based on agent feedback
- **Next Step**: Address specific concerns and resubmit

## Key Learnings 📚

After completing this lab, you should understand:

1. **Conversational RFE Creation**: How to effectively communicate feature ideas to AI
2. **Agent Specializations**: What each agent brings to the refinement process
3. **Quality Indicators**: How to recognize well-refined requirements
4. **Implementation Readiness**: When an RFE is ready for development

## Further Exploration 🔍

Ready to dig deeper?

- **Try a more complex RFE**: Multi-step workflow or integration feature
- **Explore agent reasoning**: Review detailed agent analysis for insights
- **Compare approaches**: Create the same RFE using the form interface
- **Next lab**: [Lab 2: Agent Interaction Deep Dive](lab-2-agent-interaction.md)

## Success Criteria ✅

You've successfully completed Lab 1 when:

- [ ] Created an RFE using conversational AI
- [ ] Understood each agent's role and analysis
- [ ] Received implementation-ready artifacts
- [ ] Can explain the value of AI-assisted refinement

**Congratulations!** You've experienced the power of AI-assisted requirement refinement. Your dark mode RFE is now ready for sprint planning and implementation.

---

**Next**: Ready to understand how agents collaborate? Continue with [Lab 2: Agent Interaction Deep Dive](lab-2-agent-interaction.md)