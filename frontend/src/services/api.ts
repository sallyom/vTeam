import axios, { AxiosInstance } from 'axios';
import { config } from '../config';
import {
	CreateSessionRequest,
	MCPUsage,
	Message,
	Output,
	ProgressResponse,
	Session,
	SessionDetail,
	SessionListResponse,
	Stage,
	JiraMetricsRequest,
	JiraMetricsResponse,
} from '../types/api';

class ApiService {
	private api: AxiosInstance;

	constructor() {
		this.api = axios.create({
			baseURL: config.apiUrl,
			headers: {
				'Content-Type': 'application/json',
			},
		});

		// Add request interceptor for logging
		this.api.interceptors.request.use(
			(config) => {
				console.log(`API Request: ${config.method?.toUpperCase()} ${config.url}`);
				return config;
			},
			(error) => {
				return Promise.reject(error);
			}
		);

		// Add response interceptor for error handling
		this.api.interceptors.response.use(
			(response) => {
				return response;
			},
			(error) => {
				console.error('API Error:', error.response?.data || error.message);
				return Promise.reject(error);
			}
		);
	}

	// Health check
	async healthCheck(): Promise<{ database: string; llama_stack: string }> {
		const response = await this.api.get('/healthz');
		return response.data;
	}

	// Session management
	async createSession(request: CreateSessionRequest): Promise<Session> {
		const response = await this.api.post('/sessions', request);
		return response.data;
	}

	async listSessions(page: number = 1, pageSize: number = 20): Promise<SessionListResponse> {
		const response = await this.api.get('/sessions', {
			params: { page, page_size: pageSize }
		});
		return response.data;
	}

	async getSession(sessionId: string): Promise<SessionDetail> {
		const response = await this.api.get(`/sessions/${sessionId}`);
		return response.data;
	}

	async getSessionProgress(sessionId: string): Promise<ProgressResponse> {
		const response = await this.api.get(`/sessions/${sessionId}/progress`);
		return response.data;
	}

	async getSessionMessages(sessionId: string, limit: number = 50, stage?: Stage): Promise<Message[]> {
		const response = await this.api.get(`/sessions/${sessionId}/messages`, {
			params: { limit, stage }
		});
		return response.data;
	}

	async getSessionOutputs(sessionId: string, stage?: Stage): Promise<Output[]> {
		const response = await this.api.get(`/sessions/${sessionId}/outputs`, {
			params: { stage }
		});
		return response.data;
	}

	async getSessionOutputByStage(sessionId: string, stage: Stage): Promise<Output> {
		const response = await this.api.get(`/sessions/${sessionId}/outputs/${stage}`);
		return response.data;
	}

	async getSessionMCPUsage(sessionId: string): Promise<MCPUsage[]> {
		const response = await this.api.get(`/sessions/${sessionId}/mcp-usage`);
		return response.data;
	}

	async deleteSession(sessionId: string): Promise<{ message: string }> {
		const response = await this.api.delete(`/sessions/${sessionId}`);
		console.log(response);
		return response.data;
	}

	// Get list of available prompts
	async getAvailablePrompts(): Promise<string[]> {
		const response = await this.api.get('/prompts');
		return response.data;
	}

	// Get content of a specific prompt
	async getPromptContent(promptName: string): Promise<{ name: string; content: string; file_path: string }> {
		const response = await this.api.get(`/prompts/${promptName}`);
		return response.data;
	}

	// JIRA metrics
	async getJiraMetrics(request: JiraMetricsRequest): Promise<JiraMetricsResponse> {
		const response = await this.api.post('/jira/metrics', request);
		return response.data;
	}
}

export const apiService = new ApiService();
export default apiService; 