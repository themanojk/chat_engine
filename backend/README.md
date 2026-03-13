# @littra/chat-engine-backend

Multi-tenant chat backend package with pluggable storage adapters and optional Socket.IO transport wiring.

## Install

```bash
npm install @littra/chat-engine-backend
```

## Core usage

```ts
import { ChatModule } from "@littra/chat-engine-backend";

const runtime = ChatModule.register({
  tenantResolver: () => "tenant-a",
  storage: { type: "in-memory" }, // postgres | mongo | in-memory | custom
});

const { chatService } = runtime;
```

## Storage options

### Postgres

```ts
ChatModule.register({
  tenantResolver: () => "tenant-a",
  storage: {
    type: "postgres",
    connectionString: "postgres://localhost:5432/chat_engine",
  },
});
```

### Mongo

```ts
ChatModule.register({
  tenantResolver: () => "tenant-a",
  storage: {
    type: "mongo",
    uri: "mongodb://localhost:27017",
    dbName: "chat_engine",
  },
});
```

## Socket transport (optional)

Use package socket wiring while keeping auth/bootstrap in host app.

```ts
import { ChatModule, ChatSocketServer } from "@littra/chat-engine-backend";
import { createServer } from "node:http";

const httpServer = createServer(app);
const runtime = ChatModule.register({
  tenantResolver: () => "tenant-a",
  storage: { type: "in-memory" },
});

ChatSocketServer.attach({
  server: httpServer,
  chatService: runtime.chatService,
  authProvider: ({ token }) => verifyToken(token), // must return { tenantId, userId }
  ioOptions: { cors: { origin: "*" } },
});
```

Default socket events:

- `join_conversation`
- `leave_conversation`
- `send_message`
- `typing_start`
- `typing_stop`
- `mark_read`
- outputs: `message_received`, `typing_started`, `typing_stopped`, `read_receipt`

### Socket Contract

All inbound socket events support acknowledgement callbacks.

Ack success envelope:

```json
{ "ok": true, "...": "event-specific fields" }
```

Ack error envelope:

```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR | UNAUTHORIZED | FORBIDDEN | NOT_FOUND | INTERNAL_ERROR",
    "message": "human-readable reason",
    "details": "optional"
  }
}
```

Inbound events (with payload):

- `join_conversation`
  - payload: `{ "conversationId": "string" }`
  - ack success: `{ "ok": true }`
- `leave_conversation`
  - payload: `{ "conversationId": "string" }`
  - ack success: `{ "ok": true }`
- `send_message`
  - payload: `{ "conversationId": "string", "content": "string", "messageType?": "text | system" }`
  - ack success: `{ "ok": true, "message": ChatMessage }`
- `typing_start`
  - payload: `{ "conversationId": "string" }`
  - ack success: `{ "ok": true }`
- `typing_stop`
  - payload: `{ "conversationId": "string" }`
  - ack success: `{ "ok": true }`
- `mark_read`
  - payload: `{ "conversationId": "string", "messageId": "string" }`
  - ack success: `{ "ok": true, "receipt": ReadReceipt }`

Outbound events (server emits):

- `message_received`
  - payload: `{ "tenantId": "string", "conversationId": "string", "message": ChatMessage }`
- `typing_started`
  - payload: `{ "tenantId": "string", "conversationId": "string", "userId": "string", "at": "ISO-8601" }`
- `typing_stopped`
  - payload: `{ "tenantId": "string", "conversationId": "string", "userId": "string", "at": "ISO-8601" }`
- `read_receipt`
  - payload: `ReadReceipt`

Runtime payload validation:

- `ChatSocketServer` validates inbound payloads with `zod`.
- Invalid payloads return `VALIDATION_ERROR` in ack error envelope.

Custom event names:

```ts
ChatSocketServer.attach({
  server: httpServer,
  chatService: runtime.chatService,
  authProvider,
  eventNames: {
    sendMessage: "send_msg",
    messageReceived: "msg_recv",
  },
});
```

## Auth hardening checklist

- Verify JWT signature and algorithm (never trust decoded payload without verification).
- Validate required claims for every socket connection: `tenantId`, `userId`, `exp`.
- Reject cross-tenant access by deriving room names from auth context, not client payload.
- Keep token TTL short and rotate signing keys (support key-id based verification).
- Add rate limits per user/IP for `send_message` and auth handshake attempts.
- Log auth failures with sanitized context (no raw token in logs).

Minimal auth provider example:

```ts
import jwt from "jsonwebtoken";

const authProvider = ({ token }: { token?: string }) => {
  if (!token) {
    throw new Error("unauthorized: missing token");
  }

  const payload = jwt.verify(token, process.env.CHAT_JWT_SECRET!, {
    algorithms: ["HS256"],
  }) as { tenantId?: string; sub?: string };

  if (!payload.tenantId || !payload.sub) {
    throw new Error("unauthorized: missing required claims");
  }

  return { tenantId: payload.tenantId, userId: payload.sub };
};
```

## Nest integration

```ts
import { NestChatModule } from "@littra/chat-engine-backend";

@Module({
  imports: [
    NestChatModule.register({
      tenantResolver: () => "tenant-a",
      storage: { type: "in-memory" },
    }),
  ],
})
export class AppModule {}
```

## Build and test

```bash
npm run build
npm test
npm run test:coverage
```
