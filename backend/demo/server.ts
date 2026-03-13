import "dotenv/config";
import cors from "cors";
import express from "express";
import jwt from "jsonwebtoken";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { z } from "zod";
import { ChatModule, ChatOptions, ChatError, normalizeToChatError } from "../src";

const PORT = Number(process.env.PORT ?? 4000);
const DEMO_TENANT_ID = process.env.DEMO_TENANT_ID ?? "tenant-demo";
const DEMO_USERS = (process.env.DEMO_USERS ?? "user-a,user-b,user-c")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
const STORAGE_TYPE = process.env.CHAT_STORAGE_TYPE ?? "in-memory";
const DEMO_JWT_SECRET = process.env.DEMO_JWT_SECRET ?? "dev-chat-engine-secret";
const authClaimsSchema = z.object({
  tenantId: z.string().min(1),
  userId: z.string().min(1),
});
const demoTokenQuerySchema = z.object({
  userId: z.string().min(1),
});
const socketConversationSchema = z.object({
  conversationId: z.string().min(1),
});
const sendMessageSchema = z.object({
  conversationId: z.string().min(1),
  content: z.string().min(1),
  messageType: z.enum(["text", "system"]).optional(),
});
const markReadSchema = z.object({
  conversationId: z.string().min(1),
  messageId: z.string().min(1),
});
const messagesQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(200).optional(),
});

type AckSuccess<T extends object = Record<string, never>> = { ok: true } & T;
type AckFailure = {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

type AuthClaims = z.infer<typeof authClaimsSchema>;

function getChatOptions(): ChatOptions {
  if (STORAGE_TYPE === "postgres") {
    return {
      tenantResolver: () => DEMO_TENANT_ID,
      storage: {
        type: "postgres",
        connectionString: process.env.DATABASE_URL ?? "postgres://localhost:5432/chat_engine",
      },
    };
  }

  if (STORAGE_TYPE === "mongo") {
    return {
      tenantResolver: () => DEMO_TENANT_ID,
      storage: {
        type: "mongo",
        uri: process.env.MONGO_URI ?? "mongodb://localhost:27017",
        dbName: process.env.MONGO_DB_NAME ?? "chat_engine",
      },
    };
  }

  return {
    tenantResolver: () => DEMO_TENANT_ID,
    storage: {
      type: "in-memory",
    },
  };
}

function roomName(tenantId: string, conversationId: string): string {
  return `tenant:${tenantId}:conversation:${conversationId}`;
}

function createDemoToken(userId: string): string {
  return jwt.sign({ tenantId: DEMO_TENANT_ID, userId }, DEMO_JWT_SECRET, {
    expiresIn: "12h",
  });
}

function extractBearerToken(authorization?: string): string | undefined {
  if (!authorization) {
    return undefined;
  }
  const [scheme, token] = authorization.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return undefined;
  }
  return token;
}

function verifyAuthToken(token: string): AuthClaims {
  const decoded = jwt.verify(token, DEMO_JWT_SECRET) as unknown;
  return authClaimsSchema.parse(decoded);
}

function toErrorBody(error: unknown): { code: string; message: string; details?: unknown; statusCode: number } {
  const normalized = normalizeToChatError(error);
  return {
    code: normalized.code,
    message: normalized.message,
    details: normalized.details,
    statusCode: normalized.statusCode,
  };
}

function ackError(ack: ((value: AckFailure) => void) | undefined, error: unknown): void {
  const payload = toErrorBody(error);
  ack?.({
    ok: false,
    error: {
      code: payload.code,
      message: payload.message,
      details: payload.details,
    },
  });
}

async function bootstrap() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  const runtime = ChatModule.register(getChatOptions());
  const { chatService } = runtime;

  const demoConversation = await chatService.createConversation({
    tenantId: DEMO_TENANT_ID,
    actorUserId: DEMO_USERS[0] ?? "system",
    type: "group",
    title: "Demo Conversation",
    memberIds: DEMO_USERS,
  });

  app.get("/api/demo-config", (_req, res) => {
    res.json({
      tenantId: DEMO_TENANT_ID,
      conversationId: demoConversation.id,
      users: DEMO_USERS,
      storageType: STORAGE_TYPE,
    });
  });

  app.get("/api/demo-token", (req, res) => {
    try {
      const parsed = demoTokenQuerySchema.parse({
        userId: String(req.query.userId ?? ""),
      });

      if (!DEMO_USERS.includes(parsed.userId)) {
        throw new ChatError("FORBIDDEN", "Unknown demo user", 403);
      }

      res.json({
        token: createDemoToken(parsed.userId),
      });
    } catch (error) {
      const payload = toErrorBody(error);
      res.status(payload.statusCode).json({
        error: {
          code: payload.code,
          message: payload.message,
          details: payload.details,
        },
      });
    }
  });

  app.get("/api/conversations/:conversationId/messages", async (req, res) => {
    try {
      const conversationId = req.params.conversationId;
      const token = extractBearerToken(req.header("authorization"));
      if (!token) {
        throw new ChatError("UNAUTHORIZED", "Missing bearer token", 401);
      }
      const claims = verifyAuthToken(token);
      const parsed = messagesQuerySchema.parse({
        limit: req.query.limit,
      });

      const messages = await chatService.listMessages({
        tenantId: claims.tenantId,
        actorUserId: claims.userId,
        conversationId,
        limit: parsed.limit,
      });

      res.json(messages);
    } catch (error) {
      const payload = toErrorBody(error);
      res.status(payload.statusCode).json({
        error: {
          code: payload.code,
          message: payload.message,
          details: payload.details,
        },
      });
    }
  });

  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: { origin: "*" },
  });

  io.use((socket, next) => {
    try {
      const authToken =
        (typeof socket.handshake.auth?.token === "string" ? socket.handshake.auth.token : undefined) ??
        extractBearerToken(socket.handshake.headers.authorization);

      if (!authToken) {
        throw new ChatError("UNAUTHORIZED", "Missing socket auth token", 401);
      }

      const claims = verifyAuthToken(authToken);
      socket.data.auth = claims;
      next();
    } catch (error) {
      const payload = toErrorBody(error);
      next(new Error(`${payload.code}:${payload.message}`));
    }
  });

  io.on("connection", (socket) => {
    const claims = socket.data.auth as AuthClaims;
    const tenantId = claims.tenantId;
    const userId = claims.userId;

    socket.on(
      "join_conversation",
      (payload: unknown, ack?: (value: AckSuccess<{ room: string }> | AckFailure) => void) => {
        try {
          const parsed = socketConversationSchema.parse(payload);
          const room = roomName(tenantId, parsed.conversationId);
          void socket.join(room);
          ack?.({ ok: true, room });
        } catch (error) {
          ackError(ack, error);
        }
      },
    );

    socket.on(
      "leave_conversation",
      (payload: unknown, ack?: (value: AckSuccess<{ room: string }> | AckFailure) => void) => {
        try {
          const parsed = socketConversationSchema.parse(payload);
          const room = roomName(tenantId, parsed.conversationId);
          void socket.leave(room);
          ack?.({ ok: true, room });
        } catch (error) {
          ackError(ack, error);
        }
      },
    );

    socket.on(
      "send_message",
      async (payload: unknown, ack?: (value: AckSuccess<{ message: unknown }> | AckFailure) => void) => {
        try {
          const parsed = sendMessageSchema.parse(payload);
          const message = await chatService.sendMessage({
            tenantId,
            actorUserId: userId,
            conversationId: parsed.conversationId,
            content: parsed.content,
            messageType: parsed.messageType,
          });

          io.to(roomName(tenantId, parsed.conversationId)).emit("message_received", {
            tenantId,
            conversationId: parsed.conversationId,
            message,
          });

          ack?.({ ok: true, message });
        } catch (error) {
          ackError(ack, error);
        }
      },
    );

    socket.on(
      "typing_start",
      (payload: unknown, ack?: (value: AckSuccess | AckFailure) => void) => {
        try {
          const parsed = socketConversationSchema.parse(payload);
          socket.to(roomName(tenantId, parsed.conversationId)).emit("typing_started", {
            tenantId,
            conversationId: parsed.conversationId,
            userId,
            at: new Date(),
          });
          ack?.({ ok: true });
        } catch (error) {
          ackError(ack, error);
        }
      },
    );

    socket.on(
      "typing_stop",
      (payload: unknown, ack?: (value: AckSuccess | AckFailure) => void) => {
        try {
          const parsed = socketConversationSchema.parse(payload);
          socket.to(roomName(tenantId, parsed.conversationId)).emit("typing_stopped", {
            tenantId,
            conversationId: parsed.conversationId,
            userId,
            at: new Date(),
          });
          ack?.({ ok: true });
        } catch (error) {
          ackError(ack, error);
        }
      },
    );

    socket.on(
      "mark_read",
      async (payload: unknown, ack?: (value: AckSuccess<{ receipt: unknown }> | AckFailure) => void) => {
        try {
          const parsed = markReadSchema.parse(payload);
          const receipt = await chatService.markRead({
            tenantId,
            actorUserId: userId,
            conversationId: parsed.conversationId,
            messageId: parsed.messageId,
          });

          io.to(roomName(tenantId, parsed.conversationId)).emit("read_receipt", receipt);
          ack?.({ ok: true, receipt });
        } catch (error) {
          ackError(ack, error);
        }
      },
    );
  });

  httpServer.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`demo chat server listening on http://localhost:${PORT}`);
  });
}

void bootstrap();
