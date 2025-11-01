/**
 * WebSocket Service for real-time session updates
 * Connects to the backend WebSocket endpoint and manages event subscriptions
 */

type EventHandler = (event: Record<string, unknown>) => void;

export class WebSocketService {
  private ws: WebSocket | null = null;
  private projectName: string | null = null;
  private sessionId: string | null = null;
  private eventHandlers: Map<string, Set<EventHandler>> = new Map();
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000; // Start with 1 second
  private isConnecting = false;

  /**
   * Connect to the project-level WebSocket for workflow updates
   */
  connect(projectName: string): void {
    this.projectName = projectName;
    this.sessionId = null;
    this.connectWebSocket();
  }

  /**
   * Connect to a session-specific WebSocket
   */
  connectToSession(projectName: string, sessionId: string): void {
    this.projectName = projectName;
    this.sessionId = sessionId;
    this.connectWebSocket();
  }

  private connectWebSocket(): void {
    if (this.isConnecting || this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    if (!this.projectName) {
      console.error('Cannot connect: projectName is required');
      return;
    }

    this.isConnecting = true;

    try {
      // Construct WebSocket URL
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;

      // Use session-specific endpoint if sessionId is provided
      const path = this.sessionId
        ? `/api/projects/${this.projectName}/sessions/${this.sessionId}/ws`
        : `/api/projects/${this.projectName}/ws`;

      const wsUrl = `${protocol}//${host}${path}`;

      console.log(`Connecting to WebSocket: ${wsUrl}`);
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('WebSocket connected');
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.reconnectDelay = 1000;
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          this.handleMessage(message);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        this.isConnecting = false;
      };

      this.ws.onclose = () => {
        console.log('WebSocket disconnected');
        this.isConnecting = false;
        this.ws = null;
        this.scheduleReconnect();
      };
    } catch (error) {
      console.error('Failed to create WebSocket:', error);
      this.isConnecting = false;
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    console.log(`Scheduling reconnect in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    this.reconnectTimer = setTimeout(() => {
      this.connectWebSocket();
    }, delay);
  }

  private handleMessage(message: {
    type?: string;
    sessionId?: string;
    payload?: Record<string, unknown>;
    timestamp?: string;
  }): void {
    if (!message.type) {
      console.warn('Received message without type:', message);
      return;
    }

    // Get handlers for this event type
    const handlers = this.eventHandlers.get(message.type);
    if (handlers && handlers.size > 0) {
      const event = {
        type: message.type,
        sessionID: message.sessionId,
        timestamp: message.timestamp,
        ...(message.payload || {}),
      };

      handlers.forEach((handler) => {
        try {
          handler(event);
        } catch (error) {
          console.error(`Error in event handler for ${message.type}:`, error);
        }
      });
    }
  }

  /**
   * Register an event handler
   */
  on(eventType: string, handler: EventHandler): void {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, new Set());
    }
    this.eventHandlers.get(eventType)!.add(handler);
  }

  /**
   * Unregister an event handler
   */
  off(eventType: string, handler: EventHandler): void {
    const handlers = this.eventHandlers.get(eventType);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.eventHandlers.delete(eventType);
      }
    }
  }

  /**
   * Disconnect from WebSocket
   */
  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.eventHandlers.clear();
    this.reconnectAttempts = 0;
    this.isConnecting = false;
  }

  /**
   * Check if WebSocket is connected
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

// Singleton instance for global use (optional)
let globalInstance: WebSocketService | null = null;

export function getWebSocketService(): WebSocketService {
  if (!globalInstance) {
    globalInstance = new WebSocketService();
  }
  return globalInstance;
}
