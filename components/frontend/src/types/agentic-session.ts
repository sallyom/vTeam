export type AgenticSessionPhase = "Pending" | "Creating" | "Running" | "Completed" | "Failed" | "Stopped" | "Error";

export type LLMSettings = {
	model: string;
	temperature: number;
	maxTokens: number;
};

export type GitUser = {
	name: string;
	email: string;
};

export type GitAuthentication = {
	sshKeySecret?: string;
	tokenSecret?: string;
};

export type GitRepository = {
	url: string;
	branch?: string;
	clonePath?: string;
};

export type GitConfig = {
	user?: GitUser;
	authentication?: GitAuthentication;
	repositories?: GitRepository[];
};

export type AgenticSessionSpec = {
	prompt: string;
	websiteURL: string;
	llmSettings: LLMSettings;
	timeout: number;
	displayName?: string;
	gitConfig?: GitConfig;
};

export type MessageObject = {
	content?: string;
	tool_use_id?: string;
	tool_use_name?: string;
	tool_use_input?: string;
	tool_use_is_error?: boolean;
};

export type AgenticSessionStatus = {
	phase: AgenticSessionPhase;
	message?: string;
	startTime?: string;
	completionTime?: string;
	jobName?: string;
	finalOutput?: string;
	cost?: number;
	messages?: MessageObject[];
};

export type AgenticSession = {
	metadata: {
		name: string;
		namespace: string;
		creationTimestamp: string;
		uid: string;
	};
	spec: AgenticSessionSpec;
	status?: AgenticSessionStatus;
};

export type CreateAgenticSessionRequest = {
	prompt: string;
	websiteURL: string;
	llmSettings?: Partial<LLMSettings>;
	timeout?: number;
	gitConfig?: GitConfig;
	// New fields for agent sessions
	agentPersona?: string;
	workflowPhase?: string;
	parentRFE?: string;
	sharedWorkspace?: string;
};

// New types for RFE workflows
export type WorkflowPhase = "specify" | "plan" | "tasks" | "review" | "completed";

export type AgentPersona = {
	persona: string;
	name: string;
	role: string;
	expertise: string[];
	description?: string;
};

export type ArtifactFile = {
	path: string;
	name: string;
	content: string;
	lastModified: string;
	size: number;
	agent?: string;
	phase?: string;
};

export type RFESession = {
	sessionName: string;
	agent: AgentPersona;
	phase: WorkflowPhase;
	status: AgenticSessionPhase;
	startTime?: string;
	completionTime?: string;
	finalOutput?: string;
	cost?: number;
	artifactFile?: string;
};

export type RFEWorkflow = {
	id: string;
	title: string;
	description: string;
	currentPhase: WorkflowPhase;
	status: "active" | "completed" | "failed" | "paused";
	targetRepository: GitRepository;
	selectedAgents: AgentPersona[];
	sessions: RFESession[];
	artifacts: ArtifactFile[];
	pvcName: string;
	createdAt: string;
	updatedAt: string;
	completedPhases: WorkflowPhase[];
};

export type CreateRFEWorkflowRequest = {
	title: string;
	description: string;
	targetRepository: GitRepository;
	selectedAgents: string[]; // Agent persona keys
	gitConfig?: GitConfig;
};

export type RFEWorkflowStatus = {
	phase: WorkflowPhase;
	agentProgress: {
		[agentPersona: string]: {
			status: AgenticSessionPhase;
			sessionName?: string;
			completedAt?: string;
		};
	};
	artifactCount: number;
	lastActivity: string;
};
