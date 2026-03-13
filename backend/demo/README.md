# Chat Engine Demo Server

This demo server exposes:

- `GET /api/demo-config`
- `GET /api/demo-token?userId=<id>`
- `GET /api/conversations/:conversationId/messages`
- Socket.IO events for message, typing, and read-receipt flows.

Authentication:

- REST and Socket.IO calls require JWT bearer token.
- Demo token is issued by `/api/demo-token`.

## Run

```bash
cd backend
npm install
npm run demo:server
```

Server default URL: `http://localhost:4000`.

## Auth Config

Set JWT secret (used for demo token signing):

```bash
DEMO_JWT_SECRET=dev-chat-engine-secret
```

## Storage Modes

Set environment variables before running `npm run demo:server`.

### 1) In-memory (default)

```bash
CHAT_STORAGE_TYPE=in-memory npm run demo:server
```

### 2) PostgreSQL

```bash
CHAT_STORAGE_TYPE=postgres \
DATABASE_URL=postgres://localhost:5432/chat_engine \
npm run demo:server
```

### 3) MongoDB

```bash
CHAT_STORAGE_TYPE=mongo \
MONGO_URI=mongodb://localhost:27017 \
MONGO_DB_NAME=chat_engine \
npm run demo:server
```

Use [../.env.example](/Users/manojkumar/Developer/Littra/chat_engine/backend/.env.example) as reference.
