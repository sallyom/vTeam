import axios, { AxiosInstance } from 'axios';
import { config } from '../config';

// Simplified Types for the new API
export type SessionStatus = 'pending' | 'processing' | 'ready' | 'error';
export type ChatRole = 'user' | 'agent' | 'system';

export interface CreateSessionRequest {
	jira_key: string;
	rag_store_ids?: string[];
	existing_refinement?: string;
	custom_prompts?: Record<string, string>;
}

export interface ChatMessageRequest {
	message: string;
}

export interface ChatMessage {
	id: string;
	role: ChatRole;
	content: string;
	timestamp: string;
	actions?: string[];
}

export interface SessionResponse {
	id: string;
	jira_key: string;
	status: SessionStatus;
	rag_store_ids: string[];
	created_at: string;
	updated_at: string;
	refinement_content?: string;
	jira_structure?: Record<string, any>;
	progress_message?: string;
	error_message?: string;
}

export interface SessionDetailResponse extends SessionResponse {
	chat_history: ChatMessage[];
}

export interface SessionUpdatesResponse {
	session: SessionResponse;
	new_messages: ChatMessage[];
	total_messages: number;
	has_updates: boolean;
}

export interface ChatResponse {
	message_id: string;
	agent_message_id: string;
	agent_response: string;
	actions_taken: string[];
	updated_content: Record<string, boolean>;
}

export interface RAGStoreInfo {
	store_id: string;
	name: string;
	description?: string;
	document_count: number;
	created_at: string;
}

export interface RAGStoreListResponse {
	stores: RAGStoreInfo[];
	total: number;
}

export interface RefinementResponse {
	content: string;
	last_updated: string;
	word_count: number;
}

export interface JiraStructureResponse {
	structure: Record<string, any>;
	last_updated: string;
	epic_count: number;
	story_count: number;
}

export interface EstimatesResponse {
	estimates: Record<string, any>;
	total_story_points: number;
	total_hours: number;
	last_updated: string;
}

export interface SessionListResponse {
	sessions: SessionResponse[];
	total: number;
	page: number;
	page_size: number;
}

export interface HealthResponse {
	status: string;
	timestamp: string;
	services: Record<string, string>;
}

export type LlamaIndexProcessingType =
	| 'web_scraping'
	| 'github_repo'
	| 'github_file'
	| 'pdf_document'
	| 'text_document'
	| 'api_documentation'
	| 'markdown';

export interface IngestDocumentsRequest {
	store_id: string;
	documents: any[];
	processing_type: LlamaIndexProcessingType;
	enable_progress_tracking?: boolean;
}

export interface IngestionSessionResponse {
	session_id: string;
	store_id: string;
	processing_type: LlamaIndexProcessingType;
	document_count: number;
	message: string;
}

export interface IngestionProgressResponse {
	session_id: string;
	status: string;
	progress: number;
	current_step?: string;
	processed_items?: number;
	total_items?: number;
	error_message?: string;
	result?: Record<string, unknown>;
	created_at: string;
	started_at?: string;
	completed_at?: string;
}

class SimpleApiService {
	private api: AxiosInstance;

	constructor() {
		// Use port 8001 for the simplified API by default
		const simpleApiUrl = config.apiUrl.replace(':8000', ':8001');

		this.api = axios.create({
			baseURL: simpleApiUrl,
			headers: {
				'Content-Type': 'application/json',
			},
		});

		// Add request/response interceptors for logging
		this.api.interceptors.request.use(
			(config) => {
				console.log(`[API] ${config.method?.toUpperCase()} ${config.url}`);
				return config;
			},
			(error) => {
				console.error('[API] Request error:', error);
				return Promise.reject(error);
			}
		);

		this.api.interceptors.response.use(
			(response) => {
				console.log(`[API] ${response.status} ${response.config.url}`);
				return response;
			},
			(error) => {
				console.error('[API] Response error:', error.response?.data || error.message);
				return Promise.reject(error);
			}
		);
	}

	// Health Check
	async healthCheck(): Promise<HealthResponse> {
		const response = await this.api.get<HealthResponse>('/healthz');
		return response.data;
	}

	// Session Management
	async createSession(request: CreateSessionRequest): Promise<SessionResponse> {
		const response = await this.api.post<SessionResponse>('/sessions', request);
		return response.data;
	}

	async getSession(sessionId: string): Promise<SessionDetailResponse> {
		const response = await this.api.get<SessionDetailResponse>(`/sessions/${sessionId}`);
		return response.data;
	}

	async getSessionUpdates(sessionId: string, lastMessageCount = 0): Promise<SessionUpdatesResponse> {
		const response = await this.api.get<SessionUpdatesResponse>(`/sessions/${sessionId}/updates`, {
			params: { last_message_count: lastMessageCount }
		});
		return response.data;
	}

	async listSessions(page = 1, pageSize = 20): Promise<SessionListResponse> {
		const response = await this.api.get<SessionListResponse>('/sessions', {
			params: { page, page_size: pageSize }
		});
		return response.data;
	}

	async deleteSession(sessionId: string): Promise<void> {
		await this.api.delete(`/sessions/${sessionId}`);
	}

	// Chat Interface
	async sendChatMessage(sessionId: string, request: ChatMessageRequest): Promise<ChatResponse> {
		const response = await this.api.post<ChatResponse>(`/sessions/${sessionId}/chat`, request);
		return response.data;
	}

	async getChatMessages(sessionId: string, limit = 50): Promise<{ messages: ChatMessage[] }> {
		const response = await this.api.get<{ messages: ChatMessage[] }>(`/sessions/${sessionId}/messages`, {
			params: { limit }
		});
		return response.data;
	}

	// Content Access
	async getRefinement(sessionId: string): Promise<RefinementResponse> {
		const response = await this.api.get<RefinementResponse>(`/sessions/${sessionId}/refinement`);
		return response.data;
	}

	async getJiraStructure(sessionId: string): Promise<JiraStructureResponse> {
		const response = await this.api.get<JiraStructureResponse>(`/sessions/${sessionId}/jiras`);
		return response.data;
	}

	async getEstimates(sessionId: string): Promise<EstimatesResponse> {
		const response = await this.api.get<EstimatesResponse>(`/sessions/${sessionId}/estimates`);
		return response.data;
	}

	// RAG Store Management
	async listRagStores(): Promise<RAGStoreListResponse> {
		const response = await this.api.get<RAGStoreListResponse>('/rag/stores');
		return response.data;
	}

	async createRAGStore(storeId: string, name: string, description?: string): Promise<any> {
		const response = await this.api.post('/rag/stores', {
			store_id: storeId,
			name,
			description
		});
		return response.data;
	}

	async deleteRAGStore(storeId: string): Promise<void> {
		await this.api.delete(`/rag/stores/${storeId}`);
	}

	async startIngestionSession(
		storeId: string,
		documents: any[],
		processingType: LlamaIndexProcessingType,
		enableProgressTracking = true
	): Promise<IngestionSessionResponse> {
		const response = await this.api.post<IngestionSessionResponse>('/rag/ingest', {
			store_id: storeId,
			documents,
			processing_type: processingType,
			enable_progress_tracking: enableProgressTracking
		});
		return response.data;
	}

	async getIngestionProgress(sessionId: string): Promise<IngestionProgressResponse> {
		const response = await this.api.get<IngestionProgressResponse>(`/rag/ingest/${sessionId}/progress`);
		return response.data;
	}

	async listIngestionSessions(status?: string, limit = 20): Promise<IngestionProgressResponse[]> {
		const response = await this.api.get<IngestionProgressResponse[]>('/rag/ingest/sessions', {
			params: { status, limit }
		});
		return response.data;
	}



	async setupPredefinedRAGStores(): Promise<{ message: string; details: any }> {
		const response = await this.api.post<{ message: string; details: any }>('/rag/setup-predefined');
		return response.data;
	}

	// Project Management
	async getProject(projectId: string): Promise<any> {
		const response = await this.api.get(`/projects/${projectId}`);
		return response.data;
	}

	async getProjectDocuments(projectId: string): Promise<any> {
		const response = await this.api.get(`/projects/${projectId}/documents`);
		return response.data;
	}

	async listProjects(): Promise<any> {
		const response = await this.api.get('/projects');
		return response.data;
	}

	async createProject(projectData: any): Promise<any> {
		const response = await this.api.post('/projects', projectData);
		return response.data;
	}

	async deleteProject(projectId: string): Promise<void> {
		await this.api.delete(`/projects/${projectId}`);
	}

	async ingestProjectDocuments(projectId: string, requestData: any): Promise<any> {
		const response = await this.api.post(`/projects/${projectId}/ingest`, requestData);
		return response.data;
	}

	// Utilities
	async listPrompts(): Promise<{ prompts: string[] }> {
		const response = await this.api.get<{ prompts: string[] }>('/prompts');
		return response.data;
	}
}

// Export singleton instance
export const simpleApiService = new SimpleApiService();
export default simpleApiService;