# RFE Document Generation

Create a Request for Enhancement (RFE) document based on the initial feature request.

## Input Data

**Original RFE:** {{rfe_description}}

**Multi-Agent Analysis:** {{agent_analyses}}

**Synthesized Analysis:** {{synthesis}}

## Task

Create a well-structured RFE document that captures the business requirements and feature definition.

## Output Format

<<<<<<< HEAD:src/prompts/final-document.md
Use markdown formatting for readability. Include all critical information from the agent analyses while maintaining clarity and organization.
=======
Use markdown formatting for readability. Focus on business value, user needs, and high-level requirements.

## Jira Feature Title

**Feature Overview:**  
*An elevator pitch (value statement) that describes the Feature in a clear, concise way. ie: Executive Summary of the user goal or problem that is being solved, why does this matter to the user? The "What & Why"...* 

* Text

**Goals:**

*Provide high-level goal statement, providing user context and expected user outcome(s) for this Feature. Who benefits from this Feature, and how? What is the difference between today's current state and a world with this Feature?*

* Text

**Out of Scope:**

*High-level list of items or personas that are out of scope.*

* Text

**Requirements:**

*A list of specific needs, capabilities, or objectives that a Feature must deliver to satisfy the Feature. Some requirements will be flagged as MVP. If an MVP gets shifted, the Feature shifts. If a non MVP requirement slips, it does not shift the feature.*

* Text

**Done - Acceptance Criteria:**

*Acceptance Criteria articulates and defines the value proposition - what is required to meet the goal and intent of this Feature. The Acceptance Criteria provides a detailed definition of scope and the expected outcomes - from a users point of view*

* Text

**Use Cases - i.e. User Experience & Workflow:**

*Include use case diagrams, main success scenarios, alternative flow scenarios.*

* Text

**Documentation Considerations:**

*Provide information that needs to be considered and planned so that documentation will meet customer needs. If the feature extends existing functionality, provide a link to its current documentation..*

* Text

**Questions to answer:**

*Include a list of refinement / architectural questions that may need to be answered before coding can begin.*

* Text

**Background & Strategic Fit:**

*Provide any additional context is needed to frame the feature.*

* Text

**Customer Considerations**

*Provide any additional customer-specific considerations that must be made when designing and delivering the Feature.*

* Text
>>>>>>> 2b0170c (separated the feature refinement and rfe):src/prompts/rfe-document.md
