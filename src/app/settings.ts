import { OpenAI, OpenAIEmbedding } from "@llamaindex/openai";

import { Settings } from "llamaindex";

export function initSettings() {
	Settings.llm = new OpenAI({
		model: "gpt-4o",
		apiKey: process.env.OPENAI_API_KEY,
	});

	Settings.embedModel = new OpenAIEmbedding({
		model: "text-embedding-3-small",
		apiKey: process.env.OPENAI_API_KEY,
	});
}
