import { artifactEvent, toSourceEvent } from "@llamaindex/server";
import {
	agentStreamEvent,
	createStatefulMiddleware,
	createWorkflow,
	startAgentEvent,
	stopAgentEvent,
} from "@llamaindex/workflow";
import {
	ChatMemoryBuffer,
	Settings,
	PromptTemplate,
	extractText,
} from "llamaindex";
import { v4 as uuidv4 } from "uuid";
import {
	createAgents,
	RFEAgent,
	AgentAnalysis,
	ComponentTeam,
	ComponentTeamSchema,
} from "./agents";
import {
	rfeInputEvent,
	agentAnalysisEvent,
	allAgentsCompleteEvent,
	synthesisEvent,
	componentTeamsEvent,
	architectureDiagramEvent,
	epicsStoriesEvent,
	finalOutputEvent,
	uiEvent,
	SynthesizedAnalysis,
	SynthesizedAnalysisSchema,
	Epic,
	Story,
	EpicSchema,
	StorySchema,
	ArchitectureDiagram,
	ArchitectureDiagramSchema,
	ImplementationTimeline,
	ImplementationTimelineSchema,
} from "./events";
import { getAgentPersonas } from "./agents";
import type { AgentPersona } from "./agentLoader";

// Synthesis prompts
const SYNTHESIS_PROMPT = new PromptTemplate({
	template: `
You are a senior technical lead synthesizing analysis from multiple domain experts about an RFE.

Original RFE: {rfe_description}

Agent Analyses:
{agent_analyses}

Synthesize these analyses into a comprehensive assessment focusing on:
1. Overall complexity assessment based on all perspectives
2. Consensus recommendations across all agents
3. Identify and resolve conflicting viewpoints between agents
4. Critical risks that span multiple domains
5. Required capabilities and technologies
6. Realistic timeline estimation
7. Resource requirements by discipline

Provide a balanced synthesis that incorporates insights from all perspectives.

Format as JSON matching this schema:
{
  "overallComplexity": "LOW|MEDIUM|HIGH|VERY_HIGH",
  "consensusRecommendations": ["list of agreed recommendations"],
  "conflictingViewpoints": [
    {
      "topic": "specific area of disagreement",
      "perspectives": [
        {"persona": "agent name", "viewpoint": "their perspective"}
      ],
      "resolution": "recommended resolution"
    }
  ],
  "criticalRisks": ["cross-cutting risks"],
  "requiredCapabilities": ["needed technologies/skills"],
  "estimatedTimeline": "overall timeline estimate",
  "resourceRequirements": {
    "frontend": 1,
    "backend": 2, 
    "design": 1,
    "pm": 1,
    "qa": 1
  }
}`,
	templateVars: ["rfe_description", "agent_analyses"],
});

const COMPONENT_TEAMS_PROMPT = new PromptTemplate({
	template: `
Based on the RFE analysis and synthesis, identify the component teams that will be involved and create epics for each.

RFE: {rfe_description}

Synthesized Analysis: {synthesis}

Agent Recommendations:
{agent_analyses}

Identify component teams and create epics based on:
1. Required components and services identified by agents
2. Team boundaries and responsibilities
3. Dependencies between teams
4. Epic scope and deliverables
5. Story breakdown for each epic

Common component teams might include: Frontend, Backend API, Data Services, Infrastructure, Mobile, Integration, etc.

Format as JSON array of team objects:
[
  {
    "teamName": "Frontend Team",
    "components": ["user interface", "dashboard"],
    "responsibilities": ["UI development", "user experience"],
    "epicTitle": "User Interface Implementation",
    "epicDescription": "Develop user interface components and experiences",
    "stories": [
      {
        "title": "User story title",
        "description": "As a user, I want...",
        "acceptanceCriteria": ["criteria 1", "criteria 2"],
        "storyPoints": 5,
        "priority": "HIGH"
      }
    ]
  }
]`,
	templateVars: ["rfe_description", "synthesis", "agent_analyses"],
});

const ARCHITECTURE_DIAGRAM_PROMPT = new PromptTemplate({
	template: `
Create a system architecture diagram in Mermaid format for this RFE implementation.

RFE: {rfe_description}

Analysis Summary: {synthesis}

Component Teams: {component_teams}

Create a comprehensive architecture diagram that shows:
1. System components and their relationships
2. Data flow and integration points
3. External dependencies and services
4. User interaction points
5. Security boundaries
6. Deployment architecture

Use Mermaid graph syntax for the diagram. Focus on clarity and completeness.

Format as JSON:
{
  "type": "system",
  "mermaidCode": "graph TD\n    A[User] --> B[Frontend]\n    B --> C[API Gateway]...",
  "description": "System architecture showing...",
  "components": [
    {
      "name": "Frontend",
      "type": "UI Layer", 
      "responsibilities": ["user interface", "state management"]
    }
  ],
  "integrations": [
    {
      "from": "Frontend",
      "to": "API Gateway",
      "type": "HTTP/REST",
      "description": "User requests and data fetching"
    }
  ]
}`,
	templateVars: ["rfe_description", "synthesis", "component_teams"],
});

const EPICS_STORIES_PROMPT = new PromptTemplate({
	template: `
Create detailed epics and stories based on the component team analysis.

RFE: {rfe_description}

Component Teams: {component_teams}

Synthesis: {synthesis}

Generate comprehensive epics and stories that:
1. Cover all required functionality
2. Have clear acceptance criteria
3. Include proper story point estimates
4. Define dependencies between stories
5. Assign to appropriate teams
6. Include technical implementation notes

Format as JSON:
{
  "epics": [
    {
      "id": "epic-001",
      "title": "Epic Title",
      "description": "Detailed epic description",
      "componentTeam": "Frontend Team",
      "priority": "HIGH",
      "estimatedStoryPoints": 25,
      "dependencies": ["epic-002"],
      "acceptanceCriteria": ["epic acceptance criteria"],
      "stories": ["story-001", "story-002"]
    }
  ],
  "stories": [
    {
      "id": "story-001",
      "epicId": "epic-001", 
      "title": "Story Title",
      "description": "As a user, I want...",
      "acceptanceCriteria": ["story acceptance criteria"],
      "storyPoints": 5,
      "priority": "HIGH",
      "assignedTeam": "Frontend Team",
      "dependencies": ["story-002"],
      "technicalNotes": "Implementation details"
    }
  ]
}`,
	templateVars: ["rfe_description", "component_teams", "synthesis"],
});

const IMPLEMENTATION_TIMELINE_PROMPT = new PromptTemplate({
	template: `
Create an implementation timeline and project plan based on the epics, stories, and team analysis.

RFE: {rfe_description}

Epics: {epics}

Stories: {stories}

Synthesis: {synthesis}

Create a realistic implementation timeline that includes:
1. Development phases with dependencies
2. Duration estimates based on story points
3. Critical path analysis
4. Resource allocation across phases
5. Risk mitigation phases
6. Integration and testing phases

Format as JSON:
{
  "phases": [
    {
      "name": "Phase 1: Foundation",
      "duration": "4 weeks",
      "dependencies": [],
      "deliverables": ["backend API", "database schema"],
      "risks": ["integration complexity"],
      "teams": ["Backend Team", "Infrastructure Team"]
    }
  ],
  "criticalPath": ["Phase 1", "Phase 2", "Phase 4"],
  "totalDuration": "16 weeks",
  "resourceAllocation": {
    "frontend": [{"phase": "Phase 2", "allocation": 2}],
    "backend": [{"phase": "Phase 1", "allocation": 2}],
    "design": [{"phase": "Phase 1", "allocation": 1}],
    "pm": [{"phase": "Phase 1", "allocation": 0.5}],
    "qa": [{"phase": "Phase 3", "allocation": 1}]
  }
}`,
	templateVars: ["rfe_description", "epics", "stories", "synthesis"],
});

const FINAL_DOCUMENT_PROMPT = new PromptTemplate({
	template: `
Create a comprehensive feature refinement document based on all the analysis and planning.

Original RFE: {rfe_description}

Multi-Agent Analysis: {agent_analyses}

Synthesized Analysis: {synthesis}

Component Teams: {component_teams}

Architecture: {architecture}

Epics and Stories: {epics_stories}

Implementation Timeline: {timeline}

Create a well-structured, comprehensive document that includes:
1. Executive Summary
2. Feature Overview and Business Value
3. Technical Architecture
4. Implementation Approach
5. Team Organization and Responsibilities  
6. Development Timeline and Phases
7. Risk Assessment and Mitigation
8. Success Metrics and Acceptance Criteria
9. Resource Requirements
10. Dependencies and Integration Points

Use markdown formatting for readability. Include all critical information from the agent analyses while maintaining clarity and organization.`,
	templateVars: [
		"rfe_description",
		"agent_analyses",
		"synthesis",
		"component_teams",
		"architecture",
		"epics_stories",
		"timeline"
	],
});

// Workflow factory
export const workflowFactory = async (reqBody: any) => {
	return await getWorkflow();
};

// Main workflow definition
export async function getWorkflow() {
	const agents = await createAgents();

	const { withState, getContext } = createStatefulMiddleware(() => {
		return {
			memory: new ChatMemoryBuffer({
				llm: Settings.llm,
				chatHistory: [],
			}),
			rfeDescription: "" as string,
			agentAnalyses: [] as AgentAnalysis[],
			synthesis: null as SynthesizedAnalysis | null,
			componentTeams: [] as ComponentTeam[],
			architectureDiagram: null as ArchitectureDiagram | null,
			epics: [] as Epic[],
			stories: [] as Story[],
			timeline: null as ImplementationTimeline | null,
			finalDocument: "" as string,
		};
	});

	const workflow = withState(createWorkflow());

	// Initial RFE input and agent consultation
	workflow.handle([startAgentEvent], async (context, event) => {
		const { userInput, chatHistory = [] } = event.data;
		const { sendEvent, state } = getContext();

		if (!userInput) throw new Error("RFE description is required");

		state.memory.set(chatHistory);
		state.memory.put({ role: "user", content: userInput });
		state.rfeDescription = extractText(userInput);

		// Send initial UI event
		sendEvent(uiEvent.with({
			type: "ui_event",
			data: {
				event: "rfe_analysis",
				state: "inprogress",
				progress: 0,
				message: "Starting RFE analysis..."
			}
		}));

		return rfeInputEvent.with({ rfeDescription: state.rfeDescription });
	});

	// Multi-agent consultation
	workflow.handle([rfeInputEvent], async (context, event) => {
		const { sendEvent, state } = getContext();
		const { rfeDescription } = event.data;

		sendEvent(uiEvent.with({
			type: "ui_event",
			data: {
				event: "agent_consultation",
				state: "inprogress",
				progress: 10,
				message: "Consulting with domain experts..."
			}
		}));

		// Initialize all agents and run analyses in parallel
		const agentPersonas = await getAgentPersonas();
		const agentPromises = Object.entries(agents).map(async ([persona, agent]) => {
			const agentConfig = agentPersonas[persona];

			sendEvent(uiEvent.with({
				type: "ui_event",
				data: {
					event: "agent_consultation",
					state: "inprogress",
					persona: agentConfig.name,
					message: `${agentConfig.name} analyzing...`
				}
			}));

			const analysis = await agent.analyzeRFE(rfeDescription);

			sendEvent(uiEvent.with({
				type: "ui_event",
				data: {
					event: "agent_consultation",
					state: "inprogress",
					persona: agentConfig.name,
					message: `${agentConfig.name} analysis complete`
				}
			}));

			return { persona, analysis };
		});

		const agentResults = await Promise.all(agentPromises);
		const analyses = agentResults.map(r => r.analysis);
		state.agentAnalyses = analyses;

		sendEvent(uiEvent.with({
			type: "ui_event",
			data: {
				event: "agent_consultation",
				state: "done",
				progress: 30,
				message: "All agent consultations complete"
			}
		}));

		return allAgentsCompleteEvent.with({ analyses });
	});

	// Synthesis of agent analyses
	workflow.handle([allAgentsCompleteEvent], async (context, event) => {
		const { sendEvent, state } = getContext();
		const { analyses } = event.data;

		sendEvent(uiEvent.with({
			type: "ui_event",
			data: {
				event: "synthesis",
				state: "inprogress",
				progress: 35,
				message: "Synthesizing agent insights..."
			}
		}));

		const agentAnalysesText = analyses.map((analysis: AgentAnalysis) =>
			`${analysis.persona}: ${analysis.analysis}\n` +
			`Concerns: ${analysis.concerns.join(', ')}\n` +
			`Recommendations: ${analysis.recommendations.join(', ')}\n` +
			`Complexity: ${analysis.estimatedComplexity}\n`
		).join('\n\n');

		const prompt = SYNTHESIS_PROMPT.format({
			rfe_description: state.rfeDescription,
			agent_analyses: agentAnalysesText,
		});

		const response = await Settings.llm.complete({
			prompt,
			responseFormat: SynthesizedAnalysisSchema,
		});

		try {
			const synthesis = JSON.parse(response.text) as SynthesizedAnalysis;
			state.synthesis = synthesis;

			sendEvent(uiEvent.with({
				type: "ui_event",
				data: {
					event: "synthesis",
					state: "done",
					progress: 50,
					message: "Analysis synthesis complete"
				}
			}));

			return synthesisEvent.with({ synthesizedAnalysis: synthesis });
		} catch (error) {
			console.error("Error parsing synthesis response:", error);
			throw error;
		}
	});

	// Component teams identification
	workflow.handle([synthesisEvent], async (context, event) => {
		const { sendEvent, state } = getContext();
		const { synthesizedAnalysis } = event.data;

		sendEvent(uiEvent.with({
			type: "ui_event",
			data: {
				event: "documentation",
				state: "inprogress",
				progress: 55,
				message: "Identifying component teams..."
			}
		}));

		const agentAnalysesText = state.agentAnalyses.map(a =>
			`${a.persona}: Components: ${a.requiredComponents.join(', ')}`
		).join('\n');

		const prompt = COMPONENT_TEAMS_PROMPT.format({
			rfe_description: state.rfeDescription,
			synthesis: JSON.stringify(synthesizedAnalysis, null, 2),
			agent_analyses: agentAnalysesText,
		});

		const response = await Settings.llm.complete({ prompt });

		try {
			const componentTeams = JSON.parse(response.text) as ComponentTeam[];
			state.componentTeams = componentTeams;

			sendEvent(uiEvent.with({
				type: "ui_event",
				data: {
					event: "documentation",
					state: "inprogress",
					progress: 65,
					message: "Component teams identified"
				}
			}));

			return componentTeamsEvent.with({ componentTeams });
		} catch (error) {
			console.error("Error parsing component teams response:", error);
			throw error;
		}
	});

	// Architecture diagram generation
	workflow.handle([componentTeamsEvent], async (context, event) => {
		const { sendEvent, state } = getContext();
		const { componentTeams } = event.data;

		sendEvent(uiEvent.with({
			type: "ui_event",
			data: {
				event: "architecture",
				state: "inprogress",
				progress: 70,
				message: "Creating architecture diagram..."
			}
		}));

		const prompt = ARCHITECTURE_DIAGRAM_PROMPT.format({
			rfe_description: state.rfeDescription,
			synthesis: JSON.stringify(state.synthesis, null, 2),
			component_teams: JSON.stringify(componentTeams, null, 2),
		});

		const response = await Settings.llm.complete({
			prompt,
			responseFormat: ArchitectureDiagramSchema,
		});

		try {
			const architectureDiagram = JSON.parse(response.text) as ArchitectureDiagram;
			state.architectureDiagram = architectureDiagram;

			sendEvent(uiEvent.with({
				type: "ui_event",
				data: {
					event: "architecture",
					state: "done",
					progress: 75,
					message: "Architecture diagram created"
				}
			}));

			return architectureDiagramEvent.with({
				mermaidDiagram: architectureDiagram.mermaidCode,
				diagramDescription: architectureDiagram.description,
			});
		} catch (error) {
			console.error("Error parsing architecture diagram response:", error);
			throw error;
		}
	});

	// Epics and stories generation
	workflow.handle([architectureDiagramEvent], async (context, event) => {
		const { sendEvent, state } = getContext();

		sendEvent(uiEvent.with({
			type: "ui_event",
			data: {
				event: "epics",
				state: "inprogress",
				progress: 80,
				message: "Creating epics and stories..."
			}
		}));

		const prompt = EPICS_STORIES_PROMPT.format({
			rfe_description: state.rfeDescription,
			component_teams: JSON.stringify(state.componentTeams, null, 2),
			synthesis: JSON.stringify(state.synthesis, null, 2),
		});

		const response = await Settings.llm.complete({ prompt });

		try {
			const epicsStoriesData = JSON.parse(response.text);
			state.epics = epicsStoriesData.epics as Epic[];
			state.stories = epicsStoriesData.stories as Story[];

			sendEvent(uiEvent.with({
				type: "ui_event",
				data: {
					event: "epics",
					state: "done",
					progress: 85,
					message: "Epics and stories created"
				}
			}));

			return epicsStoriesEvent.with({
				epics: state.epics,
				stories: state.stories,
			});
		} catch (error) {
			console.error("Error parsing epics/stories response:", error);
			throw error;
		}
	});

	// Implementation timeline and final document
	workflow.handle([epicsStoriesEvent], async (context, event) => {
		const { sendEvent, state } = getContext();

		sendEvent(uiEvent.with({
			type: "ui_event",
			data: {
				event: "completion",
				state: "inprogress",
				progress: 90,
				message: "Creating implementation timeline..."
			}
		}));

		// Create implementation timeline
		const timelinePrompt = IMPLEMENTATION_TIMELINE_PROMPT.format({
			rfe_description: state.rfeDescription,
			epics: JSON.stringify(state.epics, null, 2),
			stories: JSON.stringify(state.stories, null, 2),
			synthesis: JSON.stringify(state.synthesis, null, 2),
		});

		const timelineResponse = await Settings.llm.complete({
			prompt: timelinePrompt,
			responseFormat: ImplementationTimelineSchema,
		});

		const timeline = JSON.parse(timelineResponse.text) as ImplementationTimeline;
		state.timeline = timeline;

		// Create final comprehensive document
		const finalDocPrompt = FINAL_DOCUMENT_PROMPT.format({
			rfe_description: state.rfeDescription,
			agent_analyses: JSON.stringify(state.agentAnalyses, null, 2),
			synthesis: JSON.stringify(state.synthesis, null, 2),
			component_teams: JSON.stringify(state.componentTeams, null, 2),
			architecture: JSON.stringify(state.architectureDiagram, null, 2),
			epics_stories: JSON.stringify({ epics: state.epics, stories: state.stories }, null, 2),
			timeline: JSON.stringify(timeline, null, 2),
		});

		const stream = await Settings.llm.chat({
			messages: [{ role: "user", content: finalDocPrompt }],
			stream: true,
		});

		let finalDocument = "";
		for await (const chunk of stream) {
			finalDocument += chunk.delta;
			sendEvent(agentStreamEvent.with({
				delta: chunk.delta,
				response: finalDocument,
				currentAgentName: "Documentation Generator",
				raw: stream,
			}));
		}

		state.finalDocument = finalDocument;

		sendEvent(uiEvent.with({
			type: "ui_event",
			data: {
				event: "completion",
				state: "done",
				progress: 100,
				message: "Feature refinement complete"
			}
		}));

		// Create artifacts for Canvas
		sendEvent(artifactEvent.with({
			type: "artifact",
			data: {
				type: "document",
				created_at: Date.now(),
				data: {
					title: "Feature Refinement Document",
					content: finalDocument,
					type: "markdown",
				},
			},
		}));

		sendEvent(artifactEvent.with({
			type: "artifact",
			data: {
				type: "document",
				created_at: Date.now(),
				data: {
					title: "Architecture Diagram",
					content: state.architectureDiagram?.mermaidCode || "",
					type: "mermaid",
				},
			},
		}));

		return stopAgentEvent.with({
			result: finalDocument as any,
			message: "Feature refinement completed successfully" as any,
		});
	});

	return workflow;
}
