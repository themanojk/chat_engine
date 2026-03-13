/*
  Example: consumer-owned Socket.IO transport using chat-engine package.
  This file is a reference template, not part of the package runtime.
*/

import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import { ChatModule, ChatService, ChatError, normalizeToChatError } from "../src";

type AuthClaims = {
  tenantId: string;
  userId: string;
};

const JWT_SECRET = process.env.JWT_SECRET ?? "replace-in-real-app";
const PORT = Number(process.env.PORT ?? 5000);

function conversationRoom(tenantId: string, conversationId: string): string {
  return `tenant:${tenantId}:conversation:${conversationId}`;
}

function verifyBearerToken(rawToken?: string): AuthClaims {
  if (!rawToken) {
    throw new ChatError("UNAUTHORIZED", "Missing bearer token", 401);
  }

  const decoded = jwt.verify(rawToken, JWT_SECRET) as Partial<AuthClaims>;
  if (!decoded.tenantId || !decoded.userId) {
    throw new ChatError("UNAUTHORIZED", "Invalid token claims", 401);
  }

  return {
    tenantId: decoded.tenantId,
    userId: decoded.userId,
  };
}

async function bootstrap() {
  const app = express();
  app.use(express.json());

  const runtime = ChatModule.register({
    tenantResolver: () => "unused-in-this-example",
    storage: { type: "in-memory" }, // Use postgres/mongo/custom in real app.
  });

  const chatService: ChatService = runtime.chatService;
  const server = createServer(app);
  const io = new Server(server, { cors: { origin: "*" } });

  io.use((socket, next) => {
    try {
      const token = typeof socket.handshake.auth?.token === "string" ? socket.handshake.auth.token : undefined;
      const claims = verifyBearerToken(token);
      socket.data.claims = claims;
      next();
    } catch (error) {
      const normalized = normalizeToChatError(error);
      next(new Error(`${normalized.code}:${normalized.message}`));
    }
  });

  io.on("connection", (socket) => {
    const claims = socket.data.claims as AuthClaims;

    socket.on("join_conversation", async (payload: { conversationId: string }, ack?: (value: unknown) => void) => {
      try {
        await socket.join(conversationRoom(claims.tenantId, payload.conversationId));
        ack?.({ ok: true });
      } catch (error) {
        const normalized = normalizeToChatError(error);
        ack?.({ ok: false, error: { code: normalized.code, message: normalized.message } });
      }
    });

    socket.on(
      "send_message",
      async (
        payload: { conversationId: string; content: string; messageType?: "text" | "system" },
        ack?: (value: unknown) => void,
      ) => {
        try {
          const message = await chatService.sendMessage({
            tenantId: claims.tenantId,
            actorUserId: claims.userId,
            conversationId: payload.conversationId,
            content: payload.content,
            messageType: payload.messageType,
          });

          io.to(conversationRoom(claims.tenantId, payload.conversationId)).emit("message_received", {
            tenantId: claims.tenantId,
            conversationId: payload.conversationId,
            message,
          });

          ack?.({ ok: true, message });
        } catch (error) {
          const normalized = normalizeToChatError(error);
          ack?.({ ok: false, error: { code: normalized.code, message: normalized.message } });
        }
      },
    );

    socket.on(
      "mark_read",
      async (payload: { conversationId: string; messageId: string }, ack?: (value: unknown) => void) => {
        try {
          const receipt = await chatService.markRead({
            tenantId: claims.tenantId,
            actorUserId: claims.userId,
            conversationId: payload.conversationId,
            messageId: payload.messageId,
          });

          io.to(conversationRoom(claims.tenantId, payload.conversationId)).emit("read_receipt", receipt);
          ack?.({ ok: true, receipt });
        } catch (error) {
          const normalized = normalizeToChatError(error);
          ack?.({ ok: false, error: { code: normalized.code, message: normalized.message } });
        }
      },
    );
  });

  server.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`consumer socket host listening on http://localhost:${PORT}`);
  });
}

void bootstrap();
