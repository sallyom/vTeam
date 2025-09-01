import { LlamaIndexServer } from "@llamaindex/server";
import "dotenv/config";
import { initSettings } from "./app/settings.js";
import { workflowFactory } from "./app/workflow.js";

initSettings();

new LlamaIndexServer({
	workflow: workflowFactory,
	uiConfig: {
		componentsDir: "components",
		devMode: true,
	},
}).start();
