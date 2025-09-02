import { LlamaIndexServer } from "@llamaindex/server";
import { config } from "dotenv";

// Load environment variables
config();

new LlamaIndexServer({
	uiConfig: {
		// componentsDir: "components",
		layoutDir: "layout",
		llamaDeploy: {
			deployment: "rhoai-ai-feature-sizing",
			workflow: "rfe-workflow"
		},
		starterQuestions: [
			"Analyze this RFE: Add dark mode support to our dashboard with user preference persistence",
			"What are the technical requirements and complexity for implementing single sign-on (SSO)?",
			"Estimate the development effort for adding real-time notifications to our application",
			"Break down the components needed for implementing a multi-tenant architecture",
			"Assess the risk and timeline for migrating our database from MySQL to PostgreSQL"
		],
	},
}).start();
