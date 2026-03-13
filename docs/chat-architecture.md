# Chat System Architecture

## Overview

This project implements a **scalable real-time chat backend** using WebSockets and a modular service architecture.

The system is designed to support:

* real-time messaging
* multi-device user connections
* conversation-based message routing
* horizontal scaling
* reliable message delivery

The architecture separates **connection handling, business logic, and persistence** to ensure scalability and maintainability.

---

# System Components

## 1. Client Layer

Clients can include:

* Web applications
* Mobile applications
* Desktop applications

Each client establishes a **persistent WebSocket connection** with the backend.

Connection responsibilities:

* authentication
* receiving real-time events
* sending chat events

Clients join conversation rooms to receive updates.

---

# 2. WebSocket Gateway

The WebSocket Gateway is responsible for managing all socket connections.

Responsibilities:

* authenticating connections
* managing socket lifecycle
* joining and leaving conversation rooms
* emitting real-time events
* forwarding events to service layer

The gateway must remain **thin** and must not contain business logic.

---

# 3. Conversation Rooms

Each conversation is represented by a **Socket.io Room**.

Room naming convention:

```
conversation:{conversationId}
```

Example:

```
conversation:82173
```

Users join rooms when they open conversations.

Messages are broadcast to the room so that all participants receive them instantly.

Room-based routing allows efficient message delivery without manual recipient lookup.

---

# 4. Chat Service Layer

The service layer handles all application logic.

Core services include:

### Conversation Service

Responsible for:

* creating conversations
* managing members
* validating conversation membership

### Message Service

Responsible for:

* message creation
* message editing
* message deletion
* message persistence
* broadcasting message events

### Presence Service

Responsible for:

* tracking online users
* updating last seen timestamps
* managing user socket mappings

---

# 5. Multi-Device User Support

Users may connect from multiple devices simultaneously.

Example:

User A may be connected from:

* phone
* laptop
* tablet

Each device has its own socket connection.

The system maintains a mapping:

```
user_id → socket_ids
```

Stored in Redis.

Example Redis structure:

```
user:{userId}:sockets
```

This ensures that events sent to a user are delivered to **all active devices**.

---

# 6. Redis Layer

Redis serves two critical roles.

### 1. Socket Synchronization

When multiple socket servers exist, Redis synchronizes socket events between servers using a **Pub/Sub adapter**.

This allows rooms and broadcasts to function across servers.

### 2. Presence & Connection Registry

Redis stores:

* user socket mappings
* online users
* last seen timestamps

This allows fast lookups for real-time communication.

---

# 7. Message Persistence

All messages are stored in **PostgreSQL**.

Messages must always be **persisted before being broadcast** to ensure durability.

Primary message table:

```
messages
```

Fields include:

* id
* conversation_id
* sender_id
* content
* message_type
* created_at
* edited_at

Message receipts track delivery status.

---

# 8. Message Delivery Flow

Sending a message follows this flow:

1. Client emits `send_message`
2. WebSocket Gateway receives event
3. Gateway forwards event to Message Service
4. Message Service validates conversation membership
5. Message is stored in database
6. Message event is broadcast to the conversation room

Participants receive the message instantly.

---

# 9. Typing Indicators

Typing indicators are **ephemeral events**.

They are never stored in the database.

Flow:

1. Client emits `typing_start`
2. Server broadcasts event to conversation room
3. Other participants display typing indicator

When typing stops, `typing_stop` is emitted.

---

# 10. Read Receipts

Clients send read confirmation events.

Example:

```
mark_read
```

The server updates message receipts and broadcasts read events to other participants.

This allows clients to display:

* sent
* delivered
* read

states.

---

# 11. Horizontal Scaling

The system must support multiple socket servers.

Architecture:

```
           Load Balancer
                │
    ┌───────────┼───────────┐
    │           │           │
Socket Server  Socket Server  Socket Server
    │           │           │
    └───────────┼───────────┘
                │
              Redis
                │
           Chat Services
                │
             PostgreSQL
```

Redis ensures real-time event synchronization across socket servers.

---

# 12. Error Handling Strategy

The system must handle:

* invalid conversation access
* duplicate message submissions
* socket disconnections
* message ordering issues

All message operations must validate conversation membership.

---

# 13. Security Model

Security measures include:

* JWT authentication for socket connections
* conversation membership validation
* authorization checks for message edits and deletions

Unauthorized users must never receive conversation data.

---

# 14. Future Extensions

The architecture is designed to support additional features without structural changes.

Planned extensions include:

* message reactions
* threaded replies
* message pinning
* media attachments
* full-text message search
* analytics

---

# 15. Guiding Design Principles

The chat system prioritizes:

* real-time responsiveness
* horizontal scalability
* separation of concerns
* minimal gateway logic
* strong message durability

These principles should guide all implementation decisions.
