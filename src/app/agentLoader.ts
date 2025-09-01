import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { PromptTemplate } from "llamaindex";
import { z } from "zod";

// Agent configuration schema for validation
const AgentConfigSchema = z.object({
	name: z.string(),
	persona: z.string(),
	role: z.string(),
	isRootAgent: z.boolean().default(false),
	expertise: z.array(z.string()),
	systemMessage: z.string(),
	dataSources: z.array(z.union([
		z.string(), // Simple directory names like "backend-patterns"
		z.object({
			name: z.string(),
			type: z.enum(["directory", "github", "web", "confluence", "notion"]),
			source: z.string(),
			options: z.object({
				branch: z.string().optional(),
				path: z.string().optional(),
				recursive: z.boolean().default(true).optional(),
				fileTypes: z.array(z.string()).optional(),
				chunkingStrategy: z.enum(["sentence", "semantic", "token", "paragraph"]).default("semantic").optional(),
			}).optional(),
		})
	])),
	analysisPrompt: z.object({
		template: z.string(),
		templateVars: z.array(z.string()),
	}),
	tools: z.array(z.any()).default([]), // Future: tool configurations
	sampleKnowledge: z.string(),
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;

export type DataSource = string | {
	name: string;
	type: "directory" | "github" | "web" | "confluence" | "notion";
	source: string;
	options?: {
		branch?: string;
		path?: string;
		recursive?: boolean;
		fileTypes?: string[];
		chunkingStrategy?: "sentence" | "semantic" | "token" | "paragraph";
	};
};

// Runtime agent persona configuration
export type AgentPersonaConfig = {
	name: string;
	role: string;
	expertise: string[];
	analysisPrompt: PromptTemplate;
	systemMessage: string;
	dataSources: DataSource[];
	isRootAgent: boolean;
	tools: any[];
	sampleKnowledge: string;
};

export class AgentLoader {
	private agentsDir: string;
	private loadedAgents: Map<string, AgentConfig> = new Map();
	private agentPersonas: Record<string, AgentPersonaConfig> = {};

	constructor(agentsDir: string = path.join(__dirname, "../agents")) {
		this.agentsDir = agentsDir;
	}

	/**
	 * Load all agent configurations from the agents directory
	 */
	async loadAllAgents(): Promise<Record<string, AgentPersonaConfig>> {
		if (Object.keys(this.agentPersonas).length > 0) {
			return this.agentPersonas;
		}

		const agentFiles = this.getAgentFiles();
		const loadPromises = agentFiles.map(file => this.loadAgentConfig(file));

		await Promise.all(loadPromises);

		console.log(`Loaded ${this.loadedAgents.size} agents:`, Array.from(this.loadedAgents.keys()));

		return this.agentPersonas;
	}

	/**
	 * Get all YAML files in the agents directory
	 */
	private getAgentFiles(): string[] {
		if (!fs.existsSync(this.agentsDir)) {
			throw new Error(`Agents directory not found: ${this.agentsDir}`);
		}

		return fs
			.readdirSync(this.agentsDir)
			.filter(file => file.endsWith('.yaml') || file.endsWith('.yml'))
			.map(file => path.join(this.agentsDir, file));
	}

	/**
	 * Load and validate a single agent configuration
	 */
	private async loadAgentConfig(filePath: string): Promise<void> {
		try {
			const fileContent = fs.readFileSync(filePath, 'utf8');
			const rawConfig = yaml.load(fileContent) as any;

			// Validate the configuration
			const config = AgentConfigSchema.parse(rawConfig);

			// Convert to runtime configuration
			const agentPersona: AgentPersonaConfig = {
				name: config.name,
				role: config.role,
				expertise: config.expertise,
				systemMessage: config.systemMessage,
				dataSources: config.dataSources,
				isRootAgent: config.isRootAgent,
				tools: config.tools,
				sampleKnowledge: config.sampleKnowledge,
				analysisPrompt: new PromptTemplate({
					template: config.analysisPrompt.template,
					templateVars: config.analysisPrompt.templateVars,
				}),
			};

			// Store configurations
			this.loadedAgents.set(config.persona, config);
			this.agentPersonas[config.persona] = agentPersona;

			console.log(`Loaded agent: ${config.persona} (${config.name})`);
		} catch (error) {
			console.error(`Error loading agent config from ${filePath}:`, error);
			throw error;
		}
	}

	/**
	 * Get all available agent personas (keys)
	 */
	getAgentPersonas(): string[] {
		return Object.keys(this.agentPersonas);
	}

	/**
	 * Get a specific agent configuration
	 */
	getAgentConfig(persona: string): AgentPersonaConfig | undefined {
		return this.agentPersonas[persona];
	}

	/**
	 * Get the root agent (if any)
	 */
	getRootAgent(): { persona: string; config: AgentPersonaConfig } | null {
		for (const [persona, config] of Object.entries(this.agentPersonas)) {
			if (config.isRootAgent) {
				return { persona, config };
			}
		}
		return null;
	}

	/**
	 * Get all non-root agents
	 */
	getSpecialistAgents(): Record<string, AgentPersonaConfig> {
		const specialists: Record<string, AgentPersonaConfig> = {};

		for (const [persona, config] of Object.entries(this.agentPersonas)) {
			if (!config.isRootAgent) {
				specialists[persona] = config;
			}
		}

		return specialists;
	}

	/**
	 * Get data sources for a specific agent
	 */
	getAgentDataSources(persona: string): DataSource[] {
		const config = this.agentPersonas[persona];
		return config ? config.dataSources : [];
	}

	/**
	 * Get simplified data source names for a specific agent (for backwards compatibility)
	 */
	getAgentDataSourceNames(persona: string): string[] {
		const config = this.agentPersonas[persona];
		if (!config) return [];

		return config.dataSources.map(ds => {
			if (typeof ds === 'string') return ds;
			return ds.name;
		});
	}

	/**
	 * Get sample knowledge for an agent (useful for RAG initialization)
	 */
	getAgentSampleKnowledge(persona: string): string {
		const config = this.agentPersonas[persona];
		return config ? config.sampleKnowledge : "";
	}

	/**
	 * Reload all agent configurations (useful for development)
	 */
	async reloadAgents(): Promise<Record<string, AgentPersonaConfig>> {
		this.loadedAgents.clear();
		this.agentPersonas = {};
		return this.loadAllAgents();
	}

	/**
	 * Validate that all required agent directories exist in the data folder
	 */
	validateDataDirectories(dataDir: string): { missing: string[]; existing: string[] } {
		const missing: string[] = [];
		const existing: string[] = [];

		for (const [persona, config] of Object.entries(this.agentPersonas)) {
			for (const dataSource of config.dataSources) {
				// For object data sources, we only validate directory types
				if (typeof dataSource === 'object' && dataSource.type !== 'directory') {
					continue; // Skip non-directory sources like github, web, etc.
				}

				const sourceName = typeof dataSource === 'string' ? dataSource : dataSource.name;
				const dataPath = path.join(dataDir, sourceName);

				if (fs.existsSync(dataPath)) {
					existing.push(sourceName);
				} else {
					missing.push(sourceName);
				}
			}
		}

		return { missing: [...new Set(missing)], existing: [...new Set(existing)] };
	}
}

// Global singleton instance
let agentLoader: AgentLoader | null = null;

/**
 * Get the global agent loader instance
 */
export function getAgentLoader(): AgentLoader {
	if (!agentLoader) {
		agentLoader = new AgentLoader();
	}
	return agentLoader;
}

/**
 * Initialize and load all agents
 */
export async function initializeAgents(): Promise<Record<string, AgentPersonaConfig>> {
	const loader = getAgentLoader();
	return loader.loadAllAgents();
}

/**
 * Legacy type export for backwards compatibility
 */
export type AgentPersona = string;
