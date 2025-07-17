import { config } from '../config';
import { MCPUsage, Message as MessageType } from '../types/api';

export type WebSocketMessage = {
	type: 'message' | 'mcp_usage';
	data: MessageType | MCPUsage;
};

export type WebSocketEventHandler = (message: WebSocketMessage) => void;

export class WebSocketService {
	private ws: WebSocket | null = null;
	private handlers: Map<string, WebSocketEventHandler[]> = new Map();
	private reconnectAttempts = 0;
	private maxReconnectAttempts = 5;
	private reconnectDelay = 1000;

	connect(sessionId: string): void {
		if (this.ws && this.ws.readyState === WebSocket.OPEN) {
			return;
		}

		const wsUrl = `${config.apiUrl.replace('http', 'ws')}/ws/${sessionId}`;
		console.log('Connecting to WebSocket:', wsUrl);

		this.ws = new WebSocket(wsUrl);

		this.ws.onopen = (event) => {
			console.log('WebSocket connected:', event);
			this.reconnectAttempts = 0;
		};

		this.ws.onmessage = (event) => {
			try {
				const message: WebSocketMessage = JSON.parse(event.data);
				this.notifyHandlers(sessionId, message);
			} catch (error) {
				console.error('Error parsing WebSocket message:', error);
			}
		};

		this.ws.onclose = (event) => {
			console.log('WebSocket disconnected:', event);
			this.ws = null;

			// Attempt to reconnect if not a normal closure
			if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
				setTimeout(() => {
					this.reconnectAttempts++;
					console.log(`Reconnecting... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
					this.connect(sessionId);
				}, this.reconnectDelay * this.reconnectAttempts);
			}
		};

		this.ws.onerror = (error) => {
			console.error('WebSocket error:', error);
		};
	}

	disconnect(): void {
		if (this.ws) {
			this.ws.close(1000, 'Client disconnecting');
			this.ws = null;
		}
	}

	subscribe(sessionId: string, handler: WebSocketEventHandler): () => void {
		if (!this.handlers.has(sessionId)) {
			this.handlers.set(sessionId, []);
		}
		this.handlers.get(sessionId)!.push(handler);

		// Return unsubscribe function
		return () => {
			const sessionHandlers = this.handlers.get(sessionId);
			if (sessionHandlers) {
				const index = sessionHandlers.indexOf(handler);
				if (index > -1) {
					sessionHandlers.splice(index, 1);
				}
				if (sessionHandlers.length === 0) {
					this.handlers.delete(sessionId);
				}
			}
		};
	}

	private notifyHandlers(sessionId: string, message: WebSocketMessage): void {
		const sessionHandlers = this.handlers.get(sessionId);
		if (sessionHandlers) {
			sessionHandlers.forEach(handler => {
				try {
					handler(message);
				} catch (error) {
					console.error('Error in WebSocket handler:', error);
				}
			});
		}
	}

	isConnected(): boolean {
		return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
	}
}

// Export singleton instance
export const webSocketService = new WebSocketService(); 