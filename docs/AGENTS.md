# NPM Package Architecture

## Package Goal

This chat system must be implemented as a **reusable npm package** that can be integrated into any NodeJS backend.

The package should expose a **ChatModule** that applications can import.

Example usage by consuming applications:

```
import { ChatModule } from "@company/chat-engine"

@Module({
  imports: [
    ChatModule.register({
      redisUrl: "redis://localhost:6379",
      database: "postgres",
      enablePresence: true
    })
  ]
})
export class AppModule {}
```

The package must avoid application-specific logic.

---

# Package Structure

The npm package must follow this structure:

```
chat-engine
│
├── src
│   ├── module
│   │   └── chat.module.ts
│   │
│   ├── gateway
│   │   └── chat.gateway.ts
│   │
│   ├── services
│   │   ├── message.service.ts
│   │   ├── conversation.service.ts
│   │   └── presence.service.ts
│   │
│   ├── adapters
│   │   ├── redis.adapter.ts
│   │   └── socket.adapter.ts
│   │
│   ├── interfaces
│   │   ├── message.interface.ts
│   │   ├── conversation.interface.ts
│   │   └── chat-options.interface.ts
│   │
│   ├── repositories
│   │   ├── message.repository.ts
│   │   └── conversation.repository.ts
│   │
│   ├── dto
│   │   └── send-message.dto.ts
│   │
│   └── utils
│       └── room.util.ts
│
├── index.ts
├── package.json
└── README.md
```

---

# Public API

The package must expose a **minimal public API**.

Exported items:

```
ChatModule
ChatService
ChatGateway
ChatOptions
```

Consumers should not access internal repositories directly.

Example exports:

```
export * from "./module/chat.module"
export * from "./services/chat.service"
export * from "./interfaces/chat-options.interface"
```

---

# Configuration Interface

The package must support configurable options.

Example:

```
export interface ChatOptions {
  redisUrl: string
  enablePresence?: boolean
  enableTypingIndicators?: boolean
  messageRetentionDays?: number
}
```

Configuration must be injected using **NestJS Dynamic Modules**.

Example:

```
ChatModule.register(options: ChatOptions)
```

---

# Dependency Injection

All services must rely on NestJS dependency injection.

Do NOT instantiate services manually.

Example:

```
constructor(
  private messageService: MessageService,
  private conversationService: ConversationService
) {}
```

---

# Extensibility Rules

The package must support extension without modification.

Extension points:

• custom message storage
• custom authentication
• custom message processors
• event hooks

Provide interfaces such as:

```
MessageStorageAdapter
PresenceAdapter
NotificationAdapter
```

Applications should be able to override these implementations.

---

# Event Hooks

The package must expose lifecycle hooks for external services.

Example hooks:

```
onMessageSent
onConversationCreated
onUserConnected
onUserDisconnected
```

These allow applications to integrate:

* analytics
* notifications
* moderation
* logging

---

# Database Independence

The package should not be tightly coupled to PostgreSQL.

Message persistence must use an abstraction.

Example:

```
interface MessageRepository {
  saveMessage(message)
  getMessages(conversationId)
}
```

Consumers may implement their own repository if needed.

---

# Socket Adapter Layer

Socket implementation must be abstracted.

Default adapter:

```
SocketIoAdapter
```

But the architecture should allow future adapters:

```
WebSocketAdapter
MQAdapter
```

---

# Redis Adapter

Redis must be used for:

• socket synchronization
• presence tracking
• user socket mapping

The Redis adapter must be optional and configurable.

---

# Package Boundaries

The chat-engine package must NOT:

* access application business logic
* contain authentication logic
* depend on application user models

Instead, it should rely on an abstract user identity:

```
userId: string
```

---

# Versioning Strategy

The package must follow **semantic versioning**.

```
MAJOR.MINOR.PATCH
```

Breaking changes must increase the major version.

---

# Testing Requirements

The package must include:

* unit tests for services
* integration tests for gateway events
* Redis adapter tests
* message flow tests

Testing framework:

```
Jest
```

---

# Build Output

The package must compile to:

```
dist/
```

Consumers must import compiled files.

Build command:

```
npm run build
```

---

# Documentation

The repository must include documentation for:

• installation
• configuration
• integration example
• socket events
• extension points

Example installation:

```
npm install @company/chat-engine
```

---

# Guiding Principles

When generating code for this package, AI agents must prioritize:

• modular architecture
• framework independence where possible
• extensibility
• minimal public API surface
• scalability

All generated code must align with the architecture described in:

```
AGENTS.md
docs/chat-architecture.md
```
