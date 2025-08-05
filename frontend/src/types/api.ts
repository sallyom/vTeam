export type SessionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export type Stage = 'refine' | 'epics' | 'jiras' | 'estimate';

export type MessageStatus = 'loading' | 'success' | 'error';

export type Session = {
	id: string;
	jira_key: string;
	soft_mode: boolean;
	status: SessionStatus;
	current_stage: Stage | null;
	custom_prompts?: Record<string, string>;
	vector_db_ids?: string[];
	error_message: string | null;
	started_at: string;
	completed_at: string | null;
	created_at: string;
	updated_at: string;
};

export type Message = {
	id: string;
	session_id: string;
	stage: Stage;
	role: 'user' | 'assistant';
	content: string;
	status: MessageStatus;
	timestamp: string;
};

export type Output = {
	id: string;
	session_id: string;
	stage: Stage;
	filename: string;
	content: string;
	created_at: string;
};

export type MCPUsage = {
	id: string;
	session_id: string;
	stage: Stage;
	tool_name: string;
	input_data: unknown;
	output_data: unknown;
	timestamp: string;
};

export type SessionDetail = Session & {
	messages: Message[];
	outputs: Output[];
	mcp_usages: MCPUsage[];
};

export type ProgressResponse = {
	session_id: string;
	status: SessionStatus;
	current_stage: Stage | null;
	progress_percentage: number;
	latest_message: string | null;
	error_message: string | null;
	started_at: string;
};

export type SessionListResponse = {
	sessions: Session[];
	total: number;
	page: number;
	page_size: number;
};

export type CreateSessionRequest = {
	jira_key: string;
	soft_mode: boolean;
	custom_prompts?: Record<string, string>;
	vector_db_ids?: string[];
};

export type ComponentMetrics = {
	total_story_points: number;
	total_days_to_done: number;
};

export type JiraMetricsResponse = {
	components: Record<string, ComponentMetrics>;
	total_story_points: number;
	total_days_to_done: number;
	processed_issues: number;
	done_issues: number;
};

export type JiraMetricsRequest = {
	jira_key: string;
};

// RAG-related types
export type DocumentSource = {
	name: string;
	url: string;
	mime_type?: string;
	metadata?: Record<string, unknown>;
};

export type VectorDBConfig = {
	vector_db_id: string;
	name: string;
	description?: string;
	embedding_model?: string;
	embedding_dimension?: number;
	use_case: string;
};

export type VectorDBInfo = {
	vector_db_id: string;
	name: string;
	description?: string;
	embedding_model: string;
	embedding_dimension: number;
	use_case: string;
	document_count: number;
	total_chunks: number;
	created_at: string;
	last_updated?: string;
};

export type DocumentInfo = {
	document_id: string;
	source_url: string;
	mime_type: string;
	ingestion_date: string;
	chunk_count: number;
	metadata: Record<string, unknown>;
};

export type DocumentIngestionRequest = {
	vector_db_id: string;
	documents: DocumentSource[];
	chunk_size_in_tokens?: number;
	chunk_overlap_in_tokens?: number;
};

export type DocumentIngestionResponse = {
	vector_db_id: string;
	ingested_documents: DocumentInfo[];
	total_chunks_created: number;
	ingestion_time_ms: number;
	errors: string[];
};

export type RAGQueryRequest = {
	vector_db_ids: string[];
	query: string;
	max_chunks?: number;
	chunk_template?: string;
};

export interface RAGQueryResponse {
	chunks: Array<{
		content: string;
		metadata: {
			document_id?: string;
			score?: number;
			[key: string]: unknown;
		};
	}>;
	total_chunks_found: number;
	vector_dbs_searched: string[];
	query_time_ms: number;
}

export interface ChunkInfo {
	chunk_id: string;
	content: string;
	metadata: Record<string, unknown>;
	document_id?: string;
	embedding?: number[];
}

export interface ChunkBrowseRequest {
	vector_db_id: string;
	search_query?: string;
	limit: number;
	offset: number;
}

export interface ChunkBrowseResponse {
	chunks: ChunkInfo[];
	total_chunks: number;
	vector_db_id: string;
}

// Background Task System Types
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface BackgroundTaskInfo {
	task_id: string;
	status: TaskStatus;
	created_at: string;
	started_at?: string | null;
	completed_at?: string | null;
	progress: number; // 0.0 to 1.0
	current_step?: string | null;
	total_items?: number | null;
	processed_items: number;
	error_message?: string | null;
	result?: any | null;
}

export interface BulkIngestionTaskRequest {
	vector_db_id: string;
	documents: DocumentSource[];
	chunk_size_in_tokens?: number;
	chunk_overlap_in_tokens?: number;
	use_llamaindex?: boolean;
}

export interface BulkIngestionTaskResponse {
	task_id: string;
	status: TaskStatus;
	message: string;
	estimated_duration_minutes?: number | null;
}

export type VectorDBUpdateRequest = {
	vector_db_id: string;
	document_ids?: string[];
};

export type VectorDBListResponse = {
	vector_dbs: VectorDBInfo[];
	total_count: number;
};

export type DocumentListResponse = {
	vector_db_id: string;
	documents: DocumentInfo[];
	total_count: number;
};

export type SourceInfo = {
	source_id: string;
	source_name: string;
	source_type: string;
	primary_url: string;
	all_urls: string[];
	document_count: number;
	total_chunks: number;
	ingestion_method: string;
	created_at: string;
	started_at?: string | null;
	completed_at?: string | null;
	processing_time_ms?: number | null;
	task_status: string;
	success_count: number;
	error_count: number;
	errors: string[];
};

export type SourceListResponse = {
	vector_db_id: string;
	sources: SourceInfo[];
	total: number;
	limit: number;
	offset: number;
};

// Epic and Story types
export type EpicStatus = 'todo' | 'in-progress' | 'done' | 'cancelled';
export type StoryStatus = 'todo' | 'in-progress' | 'done' | 'cancelled';
export type Priority = 'low' | 'medium' | 'high' | 'critical';

export type Story = {
	id: string;
	epic_id: string;
	title: string;
	description: string | null;
	status: StoryStatus;
	story_points: number | null;
	estimated_hours: number | null;
	actual_hours: number;
	assignee: string | null;
	created_at: string;
	updated_at: string;
	due_date: string | null;
};

export type Epic = {
	id: string;
	session_id: string;
	title: string;
	description: string | null;
	component_team: string | null;
	status: EpicStatus;
	priority: Priority;
	estimated_hours: number | null;
	actual_hours: number;
	completion_percentage: number;
	created_at: string;
	updated_at: string;
	due_date: string | null;
	stories: Story[];
};

export type StoryCreate = {
	title: string;
	description?: string;
	story_points?: number;
	estimated_hours?: number;
	assignee?: string;
	due_date?: string;
};

export type StoryUpdate = Partial<StoryCreate> & {
	status?: StoryStatus;
	actual_hours?: number;
};

export type EpicCreate = {
	title: string;
	description?: string;
	component_team?: string;
	priority?: Priority;
	estimated_hours?: number;
	due_date?: string;
	stories?: StoryCreate[];
};

export type EpicUpdate = Partial<EpicCreate> & {
	status?: EpicStatus;
	actual_hours?: number;
	completion_percentage?: number;
};

export type EpicListResponse = {
	epics: Epic[];
	total: number;
};

export type StoryListResponse = {
	stories: Story[];
	total: number;
};

// Chat message types
export type ChatMessageRequest = {
	message: string;
	context_type?: string;
};

export type ChatMessageResponse = {
	message_id: string;
	response_id: string;
	response_content: string;
	actions_taken?: string[];
	updated_outputs?: string[];
}; 