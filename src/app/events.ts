import { workflowEvent } from "@llamaindex/workflow";
import { z } from "zod";
import { AgentAnalysis, ComponentTeam } from "./agents";

// RFE input event
export const rfeInputEvent = workflowEvent<{
	rfeDescription: string;
}>();

// Agent analysis events
export const agentAnalysisEvent = workflowEvent<{
	persona: string;
	analysis: AgentAnalysis;
}>();

export const allAgentsCompleteEvent = workflowEvent<{
	analyses: AgentAnalysis[];
}>();

// Synthesis and planning events
export const synthesisEvent = workflowEvent<{
	synthesizedAnalysis: SynthesizedAnalysis;
}>();

export const componentTeamsEvent = workflowEvent<{
	componentTeams: ComponentTeam[];
}>();

// Document generation events
export const documentGenerationEvent = workflowEvent<{
	refinementDocument: string;
	architectureDiagram: string;
	implementationPlan: string;
}>();

// Architecture diagram event
export const architectureDiagramEvent = workflowEvent<{
	mermaidDiagram: string;
	diagramDescription: string;
}>();

// Epic and story generation event
export const epicsStoriesEvent = workflowEvent<{
	epics: Epic[];
	stories: Story[];
}>();

// Final output event
export const finalOutputEvent = workflowEvent<{
	refinementDocument: string;
	architectureDiagram: string;
	componentTeams: ComponentTeam[];
	epics: Epic[];
	implementationTimeline: string;
}>();

// UI event for progress tracking
export const UIEventSchema = z.object({
	event: z.enum(["rfe_analysis", "agent_consultation", "synthesis", "documentation", "architecture", "epics", "completion"]),
	state: z.enum(["pending", "inprogress", "done", "error"]),
	persona: z.string().optional(),
	progress: z.number().min(0).max(100).optional(),
	message: z.string().optional(),
	data: z.any().optional(),
});

export type UIEventData = z.infer<typeof UIEventSchema>;

export const uiEvent = workflowEvent<{
	type: "ui_event";
	data: UIEventData;
}>();

// Data schemas for comprehensive feature refinement
export const SynthesizedAnalysisSchema = z.object({
	overallComplexity: z.enum(["LOW", "MEDIUM", "HIGH", "VERY_HIGH"]),
	consensusRecommendations: z.array(z.string()),
	conflictingViewpoints: z.array(z.object({
		topic: z.string(),
		perspectives: z.array(z.object({
			persona: z.string(),
			viewpoint: z.string(),
		})),
		resolution: z.string(),
	})),
	criticalRisks: z.array(z.string()),
	requiredCapabilities: z.array(z.string()),
	estimatedTimeline: z.string(),
	resourceRequirements: z.object({
		frontend: z.number(),
		backend: z.number(),
		design: z.number(),
		pm: z.number(),
		qa: z.number(),
	}),
});

export type SynthesizedAnalysis = z.infer<typeof SynthesizedAnalysisSchema>;

export const EpicSchema = z.object({
	id: z.string(),
	title: z.string(),
	description: z.string(),
	componentTeam: z.string(),
	priority: z.enum(["HIGH", "MEDIUM", "LOW"]),
	estimatedStoryPoints: z.number(),
	dependencies: z.array(z.string()),
	acceptanceCriteria: z.array(z.string()),
	stories: z.array(z.string()), // Array of story IDs
});

export type Epic = z.infer<typeof EpicSchema>;

export const StorySchema = z.object({
	id: z.string(),
	epicId: z.string(),
	title: z.string(),
	description: z.string(),
	acceptanceCriteria: z.array(z.string()),
	storyPoints: z.number(),
	priority: z.enum(["HIGH", "MEDIUM", "LOW"]),
	assignedTeam: z.string(),
	dependencies: z.array(z.string()),
	technicalNotes: z.string().optional(),
});

export type Story = z.infer<typeof StorySchema>;

// Architecture diagram types
export const ArchitectureDiagramSchema = z.object({
	type: z.enum(["system", "component", "sequence", "deployment"]),
	mermaidCode: z.string(),
	description: z.string(),
	components: z.array(z.object({
		name: z.string(),
		type: z.string(),
		responsibilities: z.array(z.string()),
	})),
	integrations: z.array(z.object({
		from: z.string(),
		to: z.string(),
		type: z.string(),
		description: z.string(),
	})),
});

export type ArchitectureDiagram = z.infer<typeof ArchitectureDiagramSchema>;

// Implementation timeline schema
export const ImplementationTimelineSchema = z.object({
	phases: z.array(z.object({
		name: z.string(),
		duration: z.string(),
		dependencies: z.array(z.string()),
		deliverables: z.array(z.string()),
		risks: z.array(z.string()),
		teams: z.array(z.string()),
	})),
	criticalPath: z.array(z.string()),
	totalDuration: z.string(),
	resourceAllocation: z.object({
		frontend: z.array(z.object({ phase: z.string(), allocation: z.number() })),
		backend: z.array(z.object({ phase: z.string(), allocation: z.number() })),
		design: z.array(z.object({ phase: z.string(), allocation: z.number() })),
		pm: z.array(z.object({ phase: z.string(), allocation: z.number() })),
		qa: z.array(z.object({ phase: z.string(), allocation: z.number() })),
	}),
});

export type ImplementationTimeline = z.infer<typeof ImplementationTimelineSchema>;
