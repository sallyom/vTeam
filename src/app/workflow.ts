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
import { z } from "zod";
import { getAgentPersonas } from "./agents";
import type { AgentPersona } from "./agentLoader";
import { getPrompt, PROMPT_NAMES } from "./prompts";

// Combined schema for epics and stories response
const EpicsStoriesResponseSchema = z.object({
	epics: z.array(EpicSchema),
	stories: z.array(StorySchema),
});



// Workflow factory
export const workflowFactory = async (reqBody: any) => {
	return await getWorkflow();
};

// Main workflow definition
export async function getWorkflow() {
	const agents = await createAgents();

	const { withState } = createStatefulMiddleware(() => {
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
		const { sendEvent, state } = context;

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
		const { sendEvent, state } = context;
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
		const { sendEvent, state } = context;
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


		const prompt = getPrompt(PROMPT_NAMES.SYNTHESIS, {
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
		const { sendEvent, state } = context;
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

		const prompt = getPrompt(PROMPT_NAMES.COMPONENT_TEAMS, {
			rfe_description: state.rfeDescription,
			synthesis: JSON.stringify(synthesizedAnalysis, null, 2),
			agent_analyses: agentAnalysesText,
		});

		const response = await Settings.llm.complete({
			prompt,
			responseFormat: ComponentTeamSchema.array()
		});

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
		const { sendEvent, state } = context;
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

		const prompt = getPrompt(PROMPT_NAMES.ARCHITECTURE_DIAGRAM, {
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
		const { sendEvent, state } = context;

		sendEvent(uiEvent.with({
			type: "ui_event",
			data: {
				event: "epics",
				state: "inprogress",
				progress: 80,
				message: "Creating epics and stories..."
			}
		}));

		const prompt = getPrompt(PROMPT_NAMES.EPICS_STORIES, {
			rfe_description: state.rfeDescription,
			component_teams: JSON.stringify(state.componentTeams, null, 2),
			synthesis: JSON.stringify(state.synthesis, null, 2),
		});

		const response = await Settings.llm.complete({
			prompt,
			responseFormat: EpicsStoriesResponseSchema
		});

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
		const { sendEvent, state } = context;

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
		const timelinePrompt = getPrompt(PROMPT_NAMES.IMPLEMENTATION_TIMELINE, {
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
		const finalDocPrompt = getPrompt(PROMPT_NAMES.FINAL_DOCUMENT, {
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
