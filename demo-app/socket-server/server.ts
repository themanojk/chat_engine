import "dotenv/config";
import cors from "cors";
import express from "express";
import { createServer } from "node:http";
import { ChatModule, ChatSocketServer, ChatError, normalizeToChatError } from "@littra/chat-engine-backend";
import { createDemoToken, parseBearerToken, verifyToken } from "./server.helpers";

const PORT = Number(process.env.PORT ?? 4000);
const DEMO_TENANT_ID = process.env.DEMO_TENANT_ID ?? "tenant-demo";
const DEMO_USERS = (process.env.DEMO_USERS ?? "user-a,user-b,user-c")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
const DEMO_JWT_SECRET = process.env.DEMO_JWT_SECRET ?? "dev-chat-engine-secret";

async function bootstrap() {
  const runtime = ChatModule.register({
    tenantResolver: () => DEMO_TENANT_ID,
    storage: { type: "in-memory" },
  });
  const { chatService } = runtime;

  const owner = DEMO_USERS[0] ?? "demo-owner";
  const conversation = await chatService.createConversation({
    tenantId: DEMO_TENANT_ID,
    actorUserId: owner,
    type: "group",
    title: "Demo Conversation",
    memberIds: DEMO_USERS.length > 0 ? DEMO_USERS : [owner],
  });

  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get("/api/demo-config", (_req, res) => {
    res.json({
      tenantId: DEMO_TENANT_ID,
      conversationId: conversation.id,
      users: DEMO_USERS,
      storageType: "in-memory",
    });
  });

  app.get("/api/demo-token", (req, res) => {
    try {
      const userId = String(req.query.userId ?? "");
      if (!userId) {
        throw new ChatError("VALIDATION_ERROR", "userId is required", 400);
      }
      if (!DEMO_USERS.includes(userId)) {
        throw new ChatError("FORBIDDEN", "Unknown demo user", 403);
      }
      res.json({ token: createDemoToken(userId, DEMO_TENANT_ID, DEMO_JWT_SECRET) });
    } catch (error) {
      const normalized = normalizeToChatError(error);
      res.status(normalized.statusCode).json({
        error: { code: normalized.code, message: normalized.message, details: normalized.details },
      });
    }
  });

  app.get("/api/conversations/:conversationId/messages", (req, res) => {
    void (async () => {
      try {
        const claims = verifyToken(parseBearerToken(req.header("authorization")), DEMO_JWT_SECRET);
        const messages = await chatService.listMessages({
          tenantId: claims.tenantId,
          actorUserId: claims.userId,
          conversationId: req.params.conversationId,
          limit: 200,
        });
        res.json(messages);
      } catch (error) {
        const normalized = normalizeToChatError(error);
        res.status(normalized.statusCode).json({
          error: { code: normalized.code, message: normalized.message, details: normalized.details },
        });
      }
    })();
  });

  const httpServer = createServer(app);

  ChatSocketServer.attach({
    server: httpServer,
    chatService,
    ioOptions: { cors: { origin: "*" } },
    authProvider: ({ token }) => verifyToken(token, DEMO_JWT_SECRET),
  });

  httpServer.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`demo-app socket server listening on http://localhost:${PORT}`);
  });
}

void bootstrap();
