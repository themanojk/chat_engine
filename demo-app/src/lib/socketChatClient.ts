import { io, Socket } from "socket.io-client";

export type MessageType = "text" | "system";

export type Message = {
  id: string;
  tenantId: string;
  conversationId: string;
  senderId: string;
  content: string;
  messageType: MessageType;
  createdAt: string;
  editedAt?: string;
  deletedAt?: string;
};

export type MessageEvent = {
  tenantId: string;
  conversationId: string;
  message: Message;
};

export type TypingEvent = {
  tenantId: string;
  conversationId: string;
  userId: string;
  at: string;
};

type ApiError = {
  code: string;
  message: string;
  details?: unknown;
};

type AckResponse<T> = ({ ok: true } & T) | { ok: false; error: ApiError };
type RefreshTokenHandler = () => Promise<string>;

export class SocketChatClient {
  private socket?: Socket;
  private authToken?: string;
  private refreshTokenHandler?: RefreshTokenHandler;
  private refreshInFlight?: Promise<string>;

  constructor(private readonly serverUrl: string) {}

  connect(token: string, refreshTokenHandler?: RefreshTokenHandler): void {
    this.disconnect();
    this.authToken = token;
    this.refreshTokenHandler = refreshTokenHandler;
    this.socket = io(this.serverUrl, {
      transports: ["websocket"],
      auth: { token },
    });
    this.attachConnectErrorHandler();
  }

  disconnect(): void {
    this.refreshInFlight = undefined;
    this.socket?.disconnect();
    this.socket = undefined;
  }

  async joinConversation(conversationId: string): Promise<void> {
    await this.emitAck("join_conversation", { conversationId }, true);
  }

  async leaveConversation(conversationId: string): Promise<void> {
    await this.emitAck("leave_conversation", { conversationId }, true);
  }

  async sendMessage(input: {
    conversationId: string;
    content: string;
    messageType?: MessageType;
  }): Promise<Message> {
    const response = await this.emitAck<{ message: Message }>("send_message", input, true);
    return response.message;
  }

  async startTyping(conversationId: string): Promise<void> {
    await this.emitAck("typing_start", { conversationId }, true);
  }

  async stopTyping(conversationId: string): Promise<void> {
    await this.emitAck("typing_stop", { conversationId }, true);
  }

  async markRead(conversationId: string, messageId: string): Promise<void> {
    await this.emitAck("mark_read", { conversationId, messageId }, true);
  }

  async listMessages(input: {
    conversationId: string;
    limit?: number;
  }): Promise<Message[]> {
    const token = this.requireAuthToken();
    const params = new URLSearchParams();
    if (input.limit) {
      params.set("limit", String(input.limit));
    }

    const response = await this.fetchWithAuth(
      `${this.serverUrl}/api/conversations/${input.conversationId}/messages?${params.toString()}`,
      true,
    );

    if (!response.ok) {
      const parsed = (await response.json()) as { error?: ApiError };
      throw new Error(parsed.error?.message ?? "Unable to load messages");
    }

    return (await response.json()) as Message[];
  }

  onMessageReceived(handler: (event: MessageEvent) => void): () => void {
    const socket = this.requireSocket();
    socket.on("message_received", handler);
    return () => socket.off("message_received", handler);
  }

  onTypingStarted(handler: (event: TypingEvent) => void): () => void {
    const socket = this.requireSocket();
    socket.on("typing_started", handler);
    return () => socket.off("typing_started", handler);
  }

  onTypingStopped(handler: (event: TypingEvent) => void): () => void {
    const socket = this.requireSocket();
    socket.on("typing_stopped", handler);
    return () => socket.off("typing_stopped", handler);
  }

  private requireSocket(): Socket {
    if (!this.socket) {
      throw new Error("Socket is not connected");
    }
    return this.socket;
  }

  private requireAuthToken(): string {
    if (!this.authToken) {
      throw new Error("Auth token is not set");
    }
    return this.authToken;
  }

  private emitAck<T extends object = Record<string, never>>(
    event: string,
    payload: unknown,
    retryOnUnauthorized: boolean,
  ): Promise<T> {
    const socket = this.requireSocket();
    return new Promise((resolve, reject) => {
      socket.emit(event, payload, (response: AckResponse<T>) => {
        if (response.ok) {
          resolve(response);
          return;
        }
        if (response.error.code === "UNAUTHORIZED" && retryOnUnauthorized) {
          this.refreshAuthToken()
            .then(() => this.emitAck<T>(event, payload, false))
            .then(resolve)
            .catch(reject);
          return;
        }
        reject(new Error(`${response.error.code}:${response.error.message}`));
      });
    });
  }

  private async fetchWithAuth(url: string, retryOnUnauthorized: boolean): Promise<Response> {
    const token = this.requireAuthToken();
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const parsed = (await response.clone().json().catch(() => ({}))) as { error?: ApiError };
      if (retryOnUnauthorized && parsed.error?.code === "UNAUTHORIZED") {
        await this.refreshAuthToken();
        return this.fetchWithAuth(url, false);
      }
    }

    return response;
  }

  private attachConnectErrorHandler(): void {
    const socket = this.requireSocket();
    socket.on("connect_error", (error: Error) => {
      if (!error.message.startsWith("UNAUTHORIZED:")) {
        return;
      }

      void this.refreshAuthToken()
        .then((token) => {
          const current = this.requireSocket();
          current.auth = { token };
          current.connect();
        })
        .catch(() => {
          // Keep disconnected state if refresh fails.
        });
    });
  }

  private async refreshAuthToken(): Promise<string> {
    if (!this.refreshTokenHandler) {
      throw new Error("No token refresh handler configured");
    }

    if (this.refreshInFlight) {
      return this.refreshInFlight;
    }

    this.refreshInFlight = this.refreshTokenHandler()
      .then((token) => {
        this.authToken = token;
        return token;
      })
      .finally(() => {
        this.refreshInFlight = undefined;
      });

    return this.refreshInFlight;
  }
}

export type DemoConfig = {
  tenantId: string;
  conversationId: string;
  users: string[];
  storageType: string;
};

export async function fetchDemoConfig(serverUrl: string): Promise<DemoConfig> {
  const response = await fetch(`${serverUrl}/api/demo-config`);
  if (!response.ok) {
    throw new Error("Unable to load demo configuration");
  }
  return (await response.json()) as DemoConfig;
}

export async function fetchDemoToken(serverUrl: string, userId: string): Promise<string> {
  const params = new URLSearchParams({ userId });
  const response = await fetch(`${serverUrl}/api/demo-token?${params.toString()}`);
  if (!response.ok) {
    const parsed = (await response.json()) as { error?: ApiError };
    throw new Error(parsed.error?.message ?? "Unable to load demo token");
  }
  const parsed = (await response.json()) as { token: string };
  return parsed.token;
}
