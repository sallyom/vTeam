import {
	VectorStoreIndex,
	storageContextFromDefaults,
	Document,
} from "llamaindex";
import { SimpleDirectoryReader } from "@llamaindex/readers/directory";
import fs from "node:fs";
import path from "node:path";
import { getAgentLoader, type AgentPersona } from "./agentLoader";

const TYPESCRIPT_STORAGE_DIR = "./output/llamacloud";
const PYTHON_STORAGE_DIR = "./output/python-rag";
const DATA_DIR = "./data";

// Simple hybrid loading - try Python first, fallback to TypeScript
const agentIndexes: Map<AgentPersona, VectorStoreIndex> = new Map();

export async function getDataSource(persona?: AgentPersona) {
	if (!persona) {
		return await getCombinedIndex();
	}

	if (!agentIndexes.has(persona)) {
		const index = await createHybridPersonaIndex(persona);
		agentIndexes.set(persona, index);
	}

	return agentIndexes.get(persona)!;
}

async function createHybridPersonaIndex(persona: AgentPersona): Promise<VectorStoreIndex> {
	// Try Python-generated index first
	const pythonIndex = await tryLoadPythonIndex(persona);
	if (pythonIndex) {
		console.log(`🐍 Using Python-generated index for ${persona}`);
		return pythonIndex;
	}

	// Fallback to TypeScript generation
	console.log(`📦 Falling back to TypeScript index generation for ${persona}`);
	return await createTypeScriptIndex(persona);
}

async function tryLoadPythonIndex(persona: AgentPersona): Promise<VectorStoreIndex | null> {
	const pythonPersonaDir = path.join(PYTHON_STORAGE_DIR, persona.toLowerCase());
	const metadataPath = path.join(pythonPersonaDir, "metadata.json");

	// Check if Python index exists
	if (!fs.existsSync(pythonPersonaDir) || !fs.existsSync(metadataPath)) {
		console.log(`📦 No Python index found for ${persona}, will use fallback`);
		return null;
	}

	try {
		// Load and display metadata for transparency
		const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
		console.log(`🐍 Loading Python index for ${persona}:`, {
			documents: metadata.document_count,
			sources: metadata.sources.join(', ')
		});

		// Load the actual index
		const storageContext = await storageContextFromDefaults({
			persistDir: pythonPersonaDir,
		});

		const index = await VectorStoreIndex.init({ storageContext });
		console.log(`✅ Successfully loaded Python index for ${persona}`);
		return index;

	} catch (error) {
		console.error(`❌ Failed to load Python index for ${persona}:`, error);
		return null;
	}
}

async function createTypeScriptIndex(persona: AgentPersona): Promise<VectorStoreIndex> {
	const personaStorageDir = path.join(TYPESCRIPT_STORAGE_DIR, persona.toLowerCase());

	// Ensure directories exist
	if (!fs.existsSync(personaStorageDir)) {
		fs.mkdirSync(personaStorageDir, { recursive: true });
	}

	// Check if we have existing TypeScript storage
	const persistPath = path.join(personaStorageDir, "docstore.json");

	if (fs.existsSync(persistPath)) {
		console.log(`Loading existing TypeScript index for ${persona}...`);
		const storageContext = await storageContextFromDefaults({
			persistDir: personaStorageDir,
		});
		return await VectorStoreIndex.init({ storageContext });
	}

	console.log(`Creating new TypeScript index for ${persona}...`);

	// Load documents from local data sources only
	const documents = await loadLocalDataSources(persona);

	// Create index
	const storageContext = await storageContextFromDefaults({
		persistDir: personaStorageDir,
	});

	const index = await VectorStoreIndex.fromDocuments(documents, {
		storageContext,
	});

	return index;
}

async function loadLocalDataSources(persona: AgentPersona): Promise<Document[]> {
	const agentLoader = getAgentLoader();
	const rawDataSources = agentLoader.getAgentDataSources(persona);
	const documents: Document[] = [];

	console.log(`📁 Loading local data sources for ${persona}...`);

	for (const dataSourceConfig of rawDataSources) {
		// Only process simple string data sources (local directories)
		if (typeof dataSourceConfig === 'string') {
			const dataSourceDir = path.join(DATA_DIR, dataSourceConfig);

			if (fs.existsSync(dataSourceDir)) {
				const reader = new SimpleDirectoryReader();
				const docs = await reader.loadData({ directoryPath: dataSourceDir });
				documents.push(...docs);
				console.log(`📂 Loaded ${docs.length} documents from ${dataSourceConfig}`);
			}
		}
		// Skip advanced configs - those should be handled by Python
	}

	// If no documents found, create sample data
	if (documents.length === 0) {
		console.log(`No local data found for ${persona}, creating with sample knowledge...`);
		return await createSamplePersonaData(persona);
	}

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
	const combinedStorageDir = path.join(TYPESCRIPT_STORAGE_DIR, "combined");

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

	console.log("Creating new combined index from local data...");

	// Simple approach - just load local documents
	const reader = new SimpleDirectoryReader();
	let documents: Document[] = [];

	if (fs.existsSync(DATA_DIR)) {
		documents = await reader.loadData({ directoryPath: DATA_DIR });
	}

	// If no data, create sample data
	if (documents.length === 0) {
		console.log("No local data found, creating sample knowledge base...");
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

// Simple utility to check if Python RAG data is available
export function checkPythonRagStatus(): {
	available: boolean;
	agentCount: number;
} {
	if (!fs.existsSync(PYTHON_STORAGE_DIR)) {
		return { available: false, agentCount: 0 };
	}

	try {
		const agentDirs = fs.readdirSync(PYTHON_STORAGE_DIR, { withFileTypes: true })
			.filter(dirent => dirent.isDirectory()).length;

		return {
			available: agentDirs > 0,
			agentCount: agentDirs
		};
	} catch (error) {
		console.warn('Could not read Python RAG directory:', error);
		return { available: false, agentCount: 0 };
	}
}
