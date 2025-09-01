import { PromptTemplate, VectorStoreIndex, MetadataMode, Settings } from "llamaindex";
import { z } from "zod";
import { getDataSource, checkPythonRagStatus } from "./hybrid-data";
import { getAgentLoader, initializeAgents, type AgentPersona, type AgentPersonaConfig } from "./agentLoader";

// Agent analysis result schema
export const AgentAnalysisSchema = z.object({
	persona: z.string(),
	analysis: z.string(),
	concerns: z.array(z.string()),
	recommendations: z.array(z.string()),
	requiredComponents: z.array(z.string()),
	estimatedComplexity: z.enum(["LOW", "MEDIUM", "HIGH", "VERY_HIGH"]),
	dependencies: z.array(z.string()),
	risks: z.array(z.string()),
	acceptanceCriteria: z.array(z.string()).optional().nullable(),
});

export type AgentAnalysis = z.infer<typeof AgentAnalysisSchema>;

// Component team identification schema
export const ComponentTeamSchema = z.object({
	teamName: z.string(),
	components: z.array(z.string()),
	responsibilities: z.array(z.string()),
	epicTitle: z.string(),
	epicDescription: z.string(),
	stories: z.array(z.object({
		title: z.string(),
		description: z.string(),
		acceptanceCriteria: z.array(z.string()),
		storyPoints: z.number(),
		priority: z.enum(["HIGH", "MEDIUM", "LOW"]),
	})),
});

export type ComponentTeam = z.infer<typeof ComponentTeamSchema>;

// Cache for loaded agent personas
let AGENT_PERSONAS: Record<string, AgentPersonaConfig> = {};

/**
 * Get all agent personas, loading them dynamically if needed
 */
export async function getAgentPersonas(): Promise<Record<string, AgentPersonaConfig>> {
	if (Object.keys(AGENT_PERSONAS).length === 0) {
		AGENT_PERSONAS = await initializeAgents();
	}
	return AGENT_PERSONAS;
}

// Agent class for handling persona-specific analysis
export class RFEAgent {
	private persona: AgentPersona;
	private config: AgentPersonaConfig;
	private index: VectorStoreIndex | null = null;

	constructor(persona: AgentPersona, config: AgentPersonaConfig) {
		this.persona = persona;
		this.config = config;
	}

	async initialize() {
		this.index = await getDataSource(this.persona);
	}

	async analyzeRFE(rfeDescription: string): Promise<AgentAnalysis> {
		if (!this.index) {
			await this.initialize();
		}

		// Retrieve relevant context from the persona's RAG store
		const retriever = this.index!.asRetriever({ similarityTopK: 5 });
		const retrievedNodes = await retriever.retrieve({ query: rfeDescription });

		const context = retrievedNodes
			.map(node => node.node.getContent(MetadataMode.NONE))
			.join("\n\n");

		// Format the prompt
		const prompt = this.config.analysisPrompt.format({
			rfe_description: rfeDescription,
			context: context,
		});

		// Get analysis from LLM
		const response = await Settings.llm.complete({
			prompt: `${this.config.systemMessage}\n\n${prompt}`,
			responseFormat: AgentAnalysisSchema,
		});

		try {
			const analysis = JSON.parse(response.text) as AgentAnalysis;
			return analysis;
		} catch (error) {
			console.error(`Error parsing response from ${this.persona}:`, error);
			// Return fallback analysis
			return {
				persona: this.config.name,
				analysis: response.text,
				concerns: [],
				recommendations: [],
				requiredComponents: [],
				estimatedComplexity: "MEDIUM",
				dependencies: [],
				risks: [],
				acceptanceCriteria: [],
			};
		}
	}
}

// Factory function to create all agents
export async function createAgents(): Promise<Record<AgentPersona, RFEAgent>> {
	const agents: Record<AgentPersona, RFEAgent> = {} as any;
	const agentPersonas = await getAgentPersonas();

	for (const [persona, config] of Object.entries(agentPersonas)) {
		agents[persona] = new RFEAgent(persona, config);
	}

	return agents;
}

// Get the root agent if one exists
export async function getRootAgent(): Promise<{ persona: string; agent: RFEAgent } | null> {
	const agentLoader = getAgentLoader();
	await agentLoader.loadAllAgents();
	const rootAgentInfo = agentLoader.getRootAgent();

	if (rootAgentInfo) {
		const agent = new RFEAgent(rootAgentInfo.persona, rootAgentInfo.config);
		return { persona: rootAgentInfo.persona, agent };
	}

	return null;
}

// Get all specialist (non-root) agents
export async function getSpecialistAgents(): Promise<Record<string, RFEAgent>> {
	const agents: Record<string, RFEAgent> = {};
	const agentLoader = getAgentLoader();
	await agentLoader.loadAllAgents();
	const specialistConfigs = agentLoader.getSpecialistAgents();

	for (const [persona, config] of Object.entries(specialistConfigs)) {
		agents[persona] = new RFEAgent(persona, config);
	}

	return agents;
}
