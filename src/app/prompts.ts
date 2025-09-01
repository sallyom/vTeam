import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Simple template replacement function
 * Replaces {{variable}} with provided values
 */
export function renderPrompt(template: string, variables: Record<string, string>): string {
	let rendered = template;

	for (const [key, value] of Object.entries(variables)) {
		const placeholder = `{{${key}}}`;
		rendered = rendered.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), value);
	}

	return rendered;
}

/**
 * Load a prompt template from the prompts directory
 */
export function loadPrompt(promptName: string): string {
	const promptPath = join(process.cwd(), 'src', 'prompts', `${promptName}.md`);
	return readFileSync(promptPath, 'utf-8');
}

/**
 * Load and render a prompt template
 */
export function getPrompt(promptName: string, variables: Record<string, string>): string {
	const template = loadPrompt(promptName);
	return renderPrompt(template, variables);
}

// Pre-loaded prompts for convenience
export const PROMPT_NAMES = {
	SYNTHESIS: 'synthesis',
	COMPONENT_TEAMS: 'component-teams',
	ARCHITECTURE_DIAGRAM: 'architecture-diagram',
	EPICS_STORIES: 'epics-stories',
	IMPLEMENTATION_TIMELINE: 'implementation-timeline',
	FINAL_DOCUMENT: 'final-document',
} as const;

export type PromptName = typeof PROMPT_NAMES[keyof typeof PROMPT_NAMES];
