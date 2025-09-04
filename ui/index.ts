import { LlamaIndexServer } from "@llamaindex/server";
import { config } from "dotenv";

// Load environment variables
config();

// RFE Builder Workflow Server - Primary workflow for creating RFE documents
new LlamaIndexServer({
	port: 3000,
	uiConfig: {
		componentsDir: "components",
		layoutDir: "layout",
		llamaDeploy: {
			deployment: "rhoai-ai-feature-sizing",
			workflow: "rfe-builder-workflow"
		},
		starterQuestions: [
			"I want to add dark mode support to our dashboard with user preference persistence",
			"Help me build an RFE for implementing single sign-on (SSO) across our applications",
			"I need to create an RFE for adding real-time notifications to our platform",
			"Build an RFE for implementing a multi-tenant architecture in our SaaS product",
			"Help me create an RFE for migrating our database from MySQL to PostgreSQL",
			"I want to add AI-powered search functionality to our knowledge base",
			"Create an RFE for implementing automated testing pipelines"
		],
	},
}).start();


