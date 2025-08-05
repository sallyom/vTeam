import axios, { AxiosInstance } from 'axios';
import { config } from '../config';
import {
	BackgroundTaskInfo,
	BulkIngestionTaskRequest,
	BulkIngestionTaskResponse,
	ChunkBrowseRequest,
	ChunkBrowseResponse,
	CreateSessionRequest,
	DocumentIngestionRequest,
	DocumentIngestionResponse,
	DocumentListResponse,
	Epic,
	EpicCreate,
	EpicListResponse,
	EpicUpdate,
	JiraMetricsResponse,
	MCPUsage,
	Message,
	Output,
	ProgressResponse,
	RAGQueryRequest,
	RAGQueryResponse,
	Session,
	SessionDetail,
	SessionListResponse,
	SourceListResponse,
	Stage,
	Story,
	StoryCreate,
	StoryListResponse,
	StoryUpdate,
	VectorDBConfig,
	VectorDBInfo,
	VectorDBListResponse,
	VectorDBUpdateRequest,
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
	async getJiraMetrics(jiraKey: string): Promise<JiraMetricsResponse> {
		const response = await this.api.post('/jira-metrics', { jira_key: jiraKey });
		return response.data;
	}

	// RAG API methods

	// Vector Database Management
	async listVectorDatabases(): Promise<VectorDBListResponse> {
		const response = await this.api.get('/rag/vector-databases');
		return response.data;
	}

	async createVectorDatabase(config: VectorDBConfig): Promise<VectorDBInfo> {
		const response = await this.api.post('/rag/vector-databases', config);
		return response.data;
	}

	async getVectorDatabase(vectorDbId: string): Promise<VectorDBInfo> {
		const response = await this.api.get(`/rag/vector-databases/${vectorDbId}`);
		return response.data;
	}

	async deleteVectorDatabase(vectorDbId: string): Promise<{ message: string }> {
		const response = await this.api.delete(`/rag/vector-databases/${vectorDbId}`);
		return response.data;
	}

	async resetVectorDatabase(vectorDbId: string): Promise<{ message: string }> {
		const response = await this.api.post(`/rag/vector-databases/${vectorDbId}/reset`);
		return response.data;
	}

	// Document Management
	async ingestDocuments(request: DocumentIngestionRequest): Promise<DocumentIngestionResponse> {
		const response = await this.api.post('/rag/ingest', request);
		return response.data;
	}

	async ingestDocumentsWithLlamaIndex(request: DocumentIngestionRequest): Promise<DocumentIngestionResponse> {
		const response = await this.api.post('/rag/ingest/llamaindex', request);
		return response.data;
	}

	// Background task system
	async startBulkIngestion(request: BulkIngestionTaskRequest): Promise<BulkIngestionTaskResponse> {
		const response = await this.api.post('/rag/bulk-ingest', request);
		return response.data;
	}

	async getTaskStatus(taskId: string): Promise<BackgroundTaskInfo> {
		const response = await this.api.get(`/rag/tasks/${taskId}`);
		return response.data;
	}

	async listAllTasks(): Promise<{ tasks: Record<string, BackgroundTaskInfo> }> {
		const response = await this.api.get('/rag/tasks');
		return response.data;
	}

	async listSources(vectorDbId: string): Promise<SourceListResponse> {
		const response = await this.api.get(`/rag/vector-databases/${vectorDbId}/sources`);
		return response.data;
	}

	async listDocuments(vectorDbId: string): Promise<DocumentListResponse> {
		const response = await this.api.get(`/rag/vector-databases/${vectorDbId}/documents`);
		return response.data;
	}

	async updateDocuments(vectorDbId: string, request: VectorDBUpdateRequest): Promise<{ message: string }> {
		const response = await this.api.put(`/rag/vector-databases/${vectorDbId}/documents`, request);
		return response.data;
	}



	// RAG Querying
	async queryRAG(request: RAGQueryRequest, sessionId?: string): Promise<RAGQueryResponse> {
		const params = sessionId ? { session_id: sessionId } : {};
		const response = await this.api.post('/rag/query', request, { params });
		return response.data;
	}

	async browseChunks(request: ChunkBrowseRequest): Promise<ChunkBrowseResponse> {
		const response = await this.api.post('/rag/chunks/browse', request);
		return response.data;
	}

	// Utility methods
	async getPredefinedVectorDBConfigs(): Promise<VectorDBConfig[]> {
		const response = await this.api.get('/rag/predefined-configs');
		return response.data;
	}

	async setupPredefinedVectorDatabases(): Promise<{ message: string; created_databases: string[] }> {
		const response = await this.api.post('/rag/setup-predefined');
		return response.data;
	}

	// Epic methods
	async getSessionEpics(sessionId: string): Promise<EpicListResponse> {
		const response = await this.api.get(`/sessions/${sessionId}/epics`);
		return response.data;
	}

	async createEpic(sessionId: string, epicData: EpicCreate): Promise<Epic> {
		const response = await this.api.post(`/sessions/${sessionId}/epics`, epicData);
		return response.data;
	}

	async getEpic(epicId: string): Promise<Epic> {
		const response = await this.api.get(`/epics/${epicId}`);
		return response.data;
	}

	async updateEpic(epicId: string, epicData: EpicUpdate): Promise<Epic> {
		const response = await this.api.put(`/epics/${epicId}`, epicData);
		return response.data;
	}

	async deleteEpic(epicId: string): Promise<{ message: string }> {
		const response = await this.api.delete(`/epics/${epicId}`);
		return response.data;
	}

	// Story methods
	async getEpicStories(epicId: string): Promise<StoryListResponse> {
		const response = await this.api.get(`/epics/${epicId}/stories`);
		return response.data;
	}

	async createStory(epicId: string, storyData: StoryCreate): Promise<Story> {
		const response = await this.api.post(`/epics/${epicId}/stories`, storyData);
		return response.data;
	}

	async getStory(storyId: string): Promise<Story> {
		const response = await this.api.get(`/stories/${storyId}`);
		return response.data;
	}

	async updateStory(storyId: string, storyData: StoryUpdate): Promise<Story> {
		const response = await this.api.put(`/stories/${storyId}`, storyData);
		return response.data;
	}

	async deleteStory(storyId: string): Promise<{ message: string }> {
		const response = await this.api.delete(`/stories/${storyId}`);
		return response.data;
	}
}

export const apiService = new ApiService();
export default apiService; 