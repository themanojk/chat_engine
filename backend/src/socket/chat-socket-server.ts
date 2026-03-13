import { Server as HttpServer } from "node:http";
import { Server, ServerOptions, Socket } from "socket.io";
import { z } from "zod";
import { normalizeToChatError } from "../errors/chat-error";
import { ChatService } from "../services/chat.service";

export type ChatSocketAuthContext = {
  tenantId: string;
  userId: string;
};

export type ChatSocketAuthProvider = (input: {
  socket: Socket;
  token?: string;
}) => Promise<ChatSocketAuthContext> | ChatSocketAuthContext;

export type ChatSocketEventNames = {
  joinConversation: string;
  leaveConversation: string;
  sendMessage: string;
  typingStart: string;
  typingStop: string;
  markRead: string;
  messageReceived: string;
  typingStarted: string;
  typingStopped: string;
  readReceipt: string;
};

export const DEFAULT_CHAT_SOCKET_EVENTS: ChatSocketEventNames = {
  joinConversation: "join_conversation",
  leaveConversation: "leave_conversation",
  sendMessage: "send_message",
  typingStart: "typing_start",
  typingStop: "typing_stop",
  markRead: "mark_read",
  messageReceived: "message_received",
  typingStarted: "typing_started",
  typingStopped: "typing_stopped",
  readReceipt: "read_receipt",
};

export interface ChatSocketServerOptions {
  server: HttpServer;
  chatService: ChatService;
  authProvider: ChatSocketAuthProvider;
  ioOptions?: Partial<ServerOptions>;
  eventNames?: Partial<ChatSocketEventNames>;
  getToken?: (socket: Socket) => string | undefined;
  roomNameBuilder?: (tenantId: string, conversationId: string) => string;
}

function defaultRoomName(tenantId: string, conversationId: string): string {
  return `tenant:${tenantId}:conversation:${conversationId}`;
}

function defaultGetToken(socket: Socket): string | undefined {
  const fromAuth = typeof socket.handshake.auth?.token === "string" ? socket.handshake.auth.token : undefined;
  if (fromAuth) {
    return fromAuth;
  }

  const authHeader = socket.handshake.headers.authorization;
  if (!authHeader) {
    return undefined;
  }

  const [scheme, token] = authHeader.split(" ");
  if (!scheme || !token || scheme.toLowerCase() !== "bearer") {
    return undefined;
  }

  return token;
}

const conversationPayloadSchema = z.object({
  conversationId: z.string().min(1),
});

const sendMessagePayloadSchema = z.object({
  conversationId: z.string().min(1),
  content: z.string().min(1),
  messageType: z.enum(["text", "system"]).optional(),
});

const markReadPayloadSchema = z.object({
  conversationId: z.string().min(1),
  messageId: z.string().min(1),
});

export class ChatSocketServer {
  readonly io: Server;
  private readonly events: ChatSocketEventNames;
  private readonly roomNameBuilder: (tenantId: string, conversationId: string) => string;

  private constructor(
    io: Server,
    private readonly chatService: ChatService,
    eventNames?: Partial<ChatSocketEventNames>,
    roomNameBuilder?: (tenantId: string, conversationId: string) => string,
  ) {
    this.io = io;
    this.events = { ...DEFAULT_CHAT_SOCKET_EVENTS, ...eventNames };
    this.roomNameBuilder = roomNameBuilder ?? defaultRoomName;
  }

  static attach(options: ChatSocketServerOptions): ChatSocketServer {
    const io = new Server(options.server, options.ioOptions);
    const instance = new ChatSocketServer(
      io,
      options.chatService,
      options.eventNames,
      options.roomNameBuilder,
    );

    instance.registerAuthMiddleware(options.authProvider, options.getToken ?? defaultGetToken);
    instance.registerSocketHandlers();
    return instance;
  }

  private registerAuthMiddleware(authProvider: ChatSocketAuthProvider, getToken: (socket: Socket) => string | undefined) {
    this.io.use(async (socket, next) => {
      try {
        const token = getToken(socket);
        const auth = await authProvider({ socket, token });
        socket.data.chatAuth = auth;
        next();
      } catch (error) {
        const normalized = normalizeToChatError(error);
        next(new Error(`${normalized.code}:${normalized.message}`));
      }
    });
  }

  private registerSocketHandlers() {
    this.io.on("connection", (socket) => {
      const auth = socket.data.chatAuth as ChatSocketAuthContext;

      socket.on(this.events.joinConversation, async (payload: { conversationId: string }, ack?: (value: unknown) => void) => {
        try {
          const parsed = conversationPayloadSchema.parse(payload);
          await socket.join(this.roomNameBuilder(auth.tenantId, parsed.conversationId));
          ack?.({ ok: true });
        } catch (error) {
          this.ackError(ack, error);
        }
      });

      socket.on(this.events.leaveConversation, async (payload: { conversationId: string }, ack?: (value: unknown) => void) => {
        try {
          const parsed = conversationPayloadSchema.parse(payload);
          await socket.leave(this.roomNameBuilder(auth.tenantId, parsed.conversationId));
          ack?.({ ok: true });
        } catch (error) {
          this.ackError(ack, error);
        }
      });

      socket.on(
        this.events.sendMessage,
        async (
          payload: { conversationId: string; content: string; messageType?: "text" | "system" },
          ack?: (value: unknown) => void,
        ) => {
          try {
            const parsed = sendMessagePayloadSchema.parse(payload);
            const message = await this.chatService.sendMessage({
              tenantId: auth.tenantId,
              actorUserId: auth.userId,
              conversationId: parsed.conversationId,
              content: parsed.content,
              messageType: parsed.messageType,
            });

            this.io.to(this.roomNameBuilder(auth.tenantId, parsed.conversationId)).emit(this.events.messageReceived, {
              tenantId: auth.tenantId,
              conversationId: parsed.conversationId,
              message,
            });

            ack?.({ ok: true, message });
          } catch (error) {
            this.ackError(ack, error);
          }
        },
      );

      socket.on(this.events.typingStart, (payload: { conversationId: string }, ack?: (value: unknown) => void) => {
        try {
          const parsed = conversationPayloadSchema.parse(payload);
          socket.to(this.roomNameBuilder(auth.tenantId, parsed.conversationId)).emit(this.events.typingStarted, {
            tenantId: auth.tenantId,
            conversationId: parsed.conversationId,
            userId: auth.userId,
            at: new Date().toISOString(),
          });
          ack?.({ ok: true });
        } catch (error) {
          this.ackError(ack, error);
        }
      });

      socket.on(this.events.typingStop, (payload: { conversationId: string }, ack?: (value: unknown) => void) => {
        try {
          const parsed = conversationPayloadSchema.parse(payload);
          socket.to(this.roomNameBuilder(auth.tenantId, parsed.conversationId)).emit(this.events.typingStopped, {
            tenantId: auth.tenantId,
            conversationId: parsed.conversationId,
            userId: auth.userId,
            at: new Date().toISOString(),
          });
          ack?.({ ok: true });
        } catch (error) {
          this.ackError(ack, error);
        }
      });

      socket.on(
        this.events.markRead,
        async (payload: { conversationId: string; messageId: string }, ack?: (value: unknown) => void) => {
          try {
            const parsed = markReadPayloadSchema.parse(payload);
            const receipt = await this.chatService.markRead({
              tenantId: auth.tenantId,
              actorUserId: auth.userId,
              conversationId: parsed.conversationId,
              messageId: parsed.messageId,
            });

            this.io.to(this.roomNameBuilder(auth.tenantId, parsed.conversationId)).emit(this.events.readReceipt, receipt);
            ack?.({ ok: true, receipt });
          } catch (error) {
            this.ackError(ack, error);
          }
        },
      );
    });
  }

  private ackError(ack: ((value: unknown) => void) | undefined, error: unknown) {
    const normalized = normalizeToChatError(error);
    ack?.({
      ok: false,
      error: {
        code: normalized.code,
        message: normalized.message,
        details: normalized.details,
      },
    });
  }
}
