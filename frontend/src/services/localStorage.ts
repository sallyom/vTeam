/**
 * Utilities for managing custom prompts in localStorage
 */

const CUSTOM_PROMPTS_KEY = 'rhoai-custom-prompts';

export type CustomPrompts = Record<string, string>;

/**
 * Save custom prompts to localStorage
 */
export const saveCustomPrompts = (prompts: CustomPrompts): void => {
	try {
		localStorage.setItem(CUSTOM_PROMPTS_KEY, JSON.stringify(prompts));
	} catch (error) {
		console.error('Failed to save custom prompts to localStorage:', error);
	}
};

/**
 * Load custom prompts from localStorage
 */
export const loadCustomPrompts = (): CustomPrompts => {
	try {
		const stored = localStorage.getItem(CUSTOM_PROMPTS_KEY);
		return stored ? JSON.parse(stored) : {};
	} catch (error) {
		console.error('Failed to load custom prompts from localStorage:', error);
		return {};
	}
};

/**
 * Save a single custom prompt
 */
export const saveCustomPrompt = (promptName: string, content: string): void => {
	const prompts = loadCustomPrompts();
	prompts[promptName] = content;
	saveCustomPrompts(prompts);
};

/**
 * Get a single custom prompt
 */
export const getCustomPrompt = (promptName: string): string | null => {
	const prompts = loadCustomPrompts();
	return prompts[promptName] || null;
};

/**
 * Delete a custom prompt
 */
export const deleteCustomPrompt = (promptName: string): void => {
	const prompts = loadCustomPrompts();
	delete prompts[promptName];
	saveCustomPrompts(prompts);
};

/**
 * Clear all custom prompts
 */
export const clearCustomPrompts = (): void => {
	try {
		localStorage.removeItem(CUSTOM_PROMPTS_KEY);
	} catch (error) {
		console.error('Failed to clear custom prompts from localStorage:', error);
	}
};

/**
 * Export custom prompts as JSON file
 */
export const exportCustomPromptsToFile = (): void => {
	const prompts = loadCustomPrompts();
	const dataStr = JSON.stringify(prompts, null, 2);
	const dataBlob = new Blob([dataStr], { type: 'application/json' });

	const link = document.createElement('a');
	link.href = URL.createObjectURL(dataBlob);
	link.download = 'rhoai-custom-prompts.json';
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
};

/**
 * Import custom prompts from a file
 */
export const importCustomPromptsFromFile = (file: File): Promise<CustomPrompts> => {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();

		reader.onload = (event) => {
			try {
				const content = event.target?.result as string;
				const prompts = JSON.parse(content);

				if (typeof prompts === 'object' && prompts !== null) {
					saveCustomPrompts(prompts);
					resolve(prompts);
				} else {
					reject(new Error('Invalid file format: expected JSON object'));
				}
			} catch {
				reject(new Error('Failed to parse JSON file'));
			}
		};

		reader.onerror = () => {
			reject(new Error('Failed to read file'));
		};

		reader.readAsText(file);
	});
}; 