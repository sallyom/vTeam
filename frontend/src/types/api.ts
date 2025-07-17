export type SessionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export type Stage = 'refine' | 'epics' | 'jiras' | 'estimate';

export type MessageStatus = 'loading' | 'success' | 'error';

export type Session = {
	id: string;
	jira_key: string;
	soft_mode: boolean;
	status: SessionStatus;
	current_stage: Stage | null;
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
}; 