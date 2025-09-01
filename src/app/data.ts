import {
	VectorStoreIndex,
	SimpleDocumentStore,
	storageContextFromDefaults,
	Document,
} from "llamaindex";
import { SimpleDirectoryReader } from "@llamaindex/readers/directory";
import fs from "node:fs";
import path from "node:path";
import { getAgentLoader, type AgentPersona } from "./agentLoader";

const STORAGE_DIR = "./output/llamacloud";
const DATA_DIR = "./data";

// Initialize RAG indexes for each persona
const agentIndexes: Map<AgentPersona, VectorStoreIndex> = new Map();

export async function getDataSource(persona?: AgentPersona) {
	if (!persona) {
		// Return combined index for general use
		return await getCombinedIndex();
	}

	// Return persona-specific index
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

	// Check if we have existing storage
	const persistPath = path.join(personaStorageDir, "docstore.json");

	if (fs.existsSync(persistPath)) {
		console.log(`Loading existing index for ${persona}...`);
		const storageContext = await storageContextFromDefaults({
			persistDir: personaStorageDir,
		});
		return await VectorStoreIndex.init({ storageContext });
	}

	console.log(`Creating new index for ${persona}...`);

	// Create new index from data
	let documents: Document[] = [];

	// Get agent data sources from loader
	const agentLoader = getAgentLoader();
	const dataSources = agentLoader.getAgentDataSources(persona);

	// Load documents from all data sources for this agent
	for (const dataSource of dataSources) {
		const dataSourceDir = path.join(DATA_DIR, dataSource);
		if (fs.existsSync(dataSourceDir)) {
			const reader = new SimpleDirectoryReader();
			const sourceDocuments = await reader.loadData({ directoryPath: dataSourceDir });
			documents.push(...sourceDocuments);
		}
	}

	// If no documents found, create sample data
	if (documents.length === 0) {
		console.log(`No data found for ${persona}, creating with sample knowledge...`);
		documents = await createSamplePersonaData(persona);
	}

	// Create index
	const storageContext = await storageContextFromDefaults({
		persistDir: personaStorageDir,
	});

	const index = await VectorStoreIndex.fromDocuments(documents, {
		storageContext,
	});

	return index;
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

	// If no data, create sample data
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

async function createSamplePersonaData(persona: AgentPersona) {
	const agentLoader = getAgentLoader();

	// Ensure agents are loaded
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
