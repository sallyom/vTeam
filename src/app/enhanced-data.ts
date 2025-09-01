import {
	VectorStoreIndex,
	SimpleDocumentStore,
	storageContextFromDefaults,
	Document,
	SentenceSplitter,
} from "llamaindex";
import { SimpleDirectoryReader } from "@llamaindex/readers/directory";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { getAgentLoader, type AgentPersona } from "./agentLoader";

const STORAGE_DIR = "./output/llamacloud";
const DATA_DIR = "./data";
const TEMP_CLONE_DIR = "./temp-clones";

// Enhanced data source configuration
export type DataSourceConfig =
	| string // Simple directory name
	| {
		name: string;
		type: "directory" | "github" | "web" | "confluence" | "notion";
		source: string;
		options?: {
			branch?: string;
			path?: string;
			recursive?: boolean;
			fileTypes?: string[];
			chunkingStrategy?: "sentence" | "semantic" | "token" | "paragraph";
			chunkSize?: number;
			chunkOverlap?: number;
		};
	};

// Initialize RAG indexes for each persona with enhanced ingestion
const agentIndexes: Map<AgentPersona, VectorStoreIndex> = new Map();

export async function getDataSource(persona?: AgentPersona) {
	if (!persona) {
		return await getCombinedIndex();
	}

	if (!agentIndexes.has(persona)) {
		const index = await createPersonaIndex(persona);
		agentIndexes.set(persona, index);
	}

	return agentIndexes.get(persona)!;
}

async function createPersonaIndex(persona: AgentPersona): Promise<VectorStoreIndex> {
	const personaStorageDir = path.join(STORAGE_DIR, persona.toLowerCase());

	// Ensure directories exist
	if (!fs.existsSync(personaStorageDir)) {
		fs.mkdirSync(personaStorageDir, { recursive: true });
	}
	if (!fs.existsSync(TEMP_CLONE_DIR)) {
		fs.mkdirSync(TEMP_CLONE_DIR, { recursive: true });
	}

	// Check if we have existing storage
	const persistPath = path.join(personaStorageDir, "docstore.json");

	if (fs.existsSync(persistPath)) {
		console.log(`Loading existing index for ${persona}...`);
		const storageContext = await storageContextFromDefaults({
			persistDir: personaStorageDir,
		});
		return await VectorStoreIndex.init({ storageContext });
	}

	console.log(`Creating enhanced index for ${persona}...`);

	// Load documents from enhanced data sources
	const documents = await loadEnhancedDataSources(persona);

	// Create index with enhanced chunking
	const storageContext = await storageContextFromDefaults({
		persistDir: personaStorageDir,
	});

	const index = await VectorStoreIndex.fromDocuments(documents, {
		storageContext,
	});

	return index;
}

async function loadEnhancedDataSources(persona: AgentPersona): Promise<Document[]> {
	const agentLoader = getAgentLoader();
	const rawDataSources = agentLoader.getAgentDataSources(persona);
	const documents: Document[] = [];

	console.log(`📚 Loading enhanced data sources for ${persona}...`);

	for (const dataSourceConfig of rawDataSources) {
		try {
			const docs = await loadSingleDataSource(dataSourceConfig, persona);
			documents.push(...docs);
		} catch (error) {
			console.error(`Error loading data source for ${persona}:`, error);
		}
	}

	// If no documents found, create sample data
	if (documents.length === 0) {
		console.log(`No data found for ${persona}, creating with sample knowledge...`);
		return await createSamplePersonaData(persona);
	}

	console.log(`✅ Loaded ${documents.length} documents for ${persona}`);
	return documents;
}

async function loadSingleDataSource(
	dataSourceConfig: string | DataSourceConfig,
	persona: AgentPersona
): Promise<Document[]> {
	// Handle simple string data sources (backward compatibility)
	if (typeof dataSourceConfig === 'string') {
		return await loadDirectoryDataSource(dataSourceConfig);
	}

	const { type, source, options = {} } = dataSourceConfig;
	console.log(`🔄 Loading ${type} data source: ${dataSourceConfig.name}`);

	switch (type) {
		case "directory":
			return await loadDirectoryDataSource(source);

		case "github":
			return await loadGitHubDataSource(source, options, persona);

		case "web":
			return await loadWebDataSource(source, options);

		default:
			console.warn(`Unsupported data source type: ${type}`);
			return [];
	}
}

async function loadDirectoryDataSource(dirName: string): Promise<Document[]> {
	const dataSourceDir = path.join(DATA_DIR, dirName);

	if (!fs.existsSync(dataSourceDir)) {
		return [];
	}

	const reader = new SimpleDirectoryReader();
	return await reader.loadData({ directoryPath: dataSourceDir });
}

async function loadGitHubDataSource(
	repoSource: string,
	options: any,
	persona: AgentPersona
): Promise<Document[]> {
	const { branch = "main", path: repoPath = "", recursive = true, fileTypes = [".md", ".txt", ".rst"] } = options;

	// Create repo-specific clone directory
	const cloneDir = path.join(TEMP_CLONE_DIR, `${persona.toLowerCase()}-${repoSource.replace('/', '-')}`);

	try {
		// Remove existing clone if it exists
		if (fs.existsSync(cloneDir)) {
			fs.rmSync(cloneDir, { recursive: true, force: true });
		}

		console.log(`📥 Cloning GitHub repo: ${repoSource}`);

		// Clone the repository
		const repoUrl = repoSource.startsWith('http') ? repoSource : `https://github.com/${repoSource}.git`;
		execSync(`git clone --depth 1 --branch ${branch} ${repoUrl} ${cloneDir}`, {
			stdio: 'pipe',
			timeout: 30000 // 30 second timeout
		});

		// Load documents from the specified path
		const targetPath = repoPath ? path.join(cloneDir, repoPath) : cloneDir;

		if (!fs.existsSync(targetPath)) {
			console.warn(`Path ${repoPath} not found in repository ${repoSource}`);
			return [];
		}

		const reader = new SimpleDirectoryReader();
		const documents = await reader.loadData({
			directoryPath: targetPath,
			recursive
		});

		// Filter by file types if specified
		const filteredDocs = fileTypes.length > 0
			? documents.filter(doc => {
				const docId = doc.id_ || '';
				return fileTypes.some(ext => docId.toLowerCase().endsWith(ext.toLowerCase()));
			})
			: documents;

		// Apply enhanced chunking
		return await applyChunking(filteredDocs, options.chunkingStrategy || "semantic");

	} catch (error) {
		console.error(`Failed to load GitHub repository ${repoSource}:`, error);
		return [];
	} finally {
		// Clean up clone directory
		try {
			if (fs.existsSync(cloneDir)) {
				fs.rmSync(cloneDir, { recursive: true, force: true });
			}
		} catch (cleanupError) {
			console.warn(`Failed to cleanup ${cloneDir}:`, cleanupError);
		}
	}
}

async function loadWebDataSource(url: string, options: any): Promise<Document[]> {
	// Placeholder for web scraping - would need a web reader implementation
	console.log(`🌐 Web scraping not yet implemented for: ${url}`);
	return [];
}

async function applyChunking(
	documents: Document[],
	strategy: "sentence" | "semantic" | "token" | "paragraph" = "semantic"
): Promise<Document[]> {
	if (strategy === "sentence") {
		// Use sentence-based chunking with LlamaIndex
		const splitter = new SentenceSplitter({
			chunkSize: 512,
			chunkOverlap: 50,
		});

		const chunkedDocs: Document[] = [];

		for (const doc of documents) {
			const chunks = splitter.splitText(doc.getText());
			chunks.forEach((chunk, index) => {
				chunkedDocs.push(new Document({
					text: chunk,
					id_: `${doc.id_}_chunk_${index}`,
					metadata: {
						...doc.metadata,
						chunk_index: index,
						chunking_strategy: "sentence"
					}
				}));
			});
		}

		return chunkedDocs;
	}

	// For now, return documents as-is for other strategies
	// TODO: Implement semantic, token, and paragraph chunking
	return documents;
}

async function createSamplePersonaData(persona: AgentPersona): Promise<Document[]> {
	const agentLoader = getAgentLoader();

	if (agentLoader.getAgentPersonas().length === 0) {
		await agentLoader.loadAllAgents();
	}

	const sampleKnowledge = agentLoader.getAgentSampleKnowledge(persona);

	if (!sampleKnowledge) {
		console.warn(`No sample knowledge found for agent: ${persona}`);
		return [];
	}

	return [new Document({ text: sampleKnowledge, id_: `${persona}_sample_data` })];
}

async function getCombinedIndex(): Promise<VectorStoreIndex> {
	const combinedStorageDir = path.join(STORAGE_DIR, "combined");

	if (!fs.existsSync(combinedStorageDir)) {
		fs.mkdirSync(combinedStorageDir, { recursive: true });
	}

	const persistPath = path.join(combinedStorageDir, "docstore.json");

	if (fs.existsSync(persistPath)) {
		console.log("Loading existing combined index...");
		const storageContext = await storageContextFromDefaults({
			persistDir: combinedStorageDir,
		});
		return await VectorStoreIndex.init({ storageContext });
	}

	console.log("Creating new combined index...");

	// Load all available data
	const reader = new SimpleDirectoryReader();
	let documents: Document[] = [];

	if (fs.existsSync(DATA_DIR)) {
		documents = await reader.loadData({ directoryPath: DATA_DIR });
	}

	// If no data, create sample data for all agents
	if (documents.length === 0) {
		console.log("No data found, creating sample knowledge base...");
		const agentLoader = getAgentLoader();
		await agentLoader.loadAllAgents();
		const agentPersonas = agentLoader.getAgentPersonas();

		for (const persona of agentPersonas) {
			const personaData = await createSamplePersonaData(persona);
			documents.push(...personaData);
		}
	}

	const storageContext = await storageContextFromDefaults({
		persistDir: combinedStorageDir,
	});

	const index = await VectorStoreIndex.fromDocuments(documents, {
		storageContext,
	});

	return index;
}
