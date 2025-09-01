import "dotenv/config";
import { initSettings } from "./app/settings.js";
import { getDataSource, AgentPersona } from "./app/data.js";
import { AGENT_PERSONAS } from "./app/agents.js";

initSettings();

async function main() {
	const arg = process.argv[2];
	if (arg === "datasource") {
		console.log("Generating datasources for all agent personas...");

		// Initialize data sources for all agent personas
		const personas = Object.keys(AGENT_PERSONAS) as AgentPersona[];

		for (const persona of personas) {
			console.log(`Initializing ${persona} data source...`);
			await getDataSource(persona);
			console.log(`${persona} data source ready.`);
		}

		// Also initialize combined data source
		console.log("Initializing combined data source...");
		await getDataSource();
		console.log("Combined data source ready.");

		console.log("All datasources generation completed.");
	} else {
		console.log("Usage: tsx src/generate.ts datasource");
	}
}

main().catch(console.error);
