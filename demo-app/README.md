# Chat Engine Demo App

React demo app wired to the backend demo server (`Socket.IO + REST`).

## Run

```bash
cd demo-app
npm install
npm run socket:server
```

In another terminal:

```bash
cd demo-app
npm install
npm run dev
```

## Environment

Set frontend backend URL (optional):

```bash
VITE_API_URL=http://localhost:4000 npm run dev
```

Use [./.env.example](/Users/manojkumar/Developer/Littra/chat_engine/demo-app/.env.example) as reference.
Use [./.env.socket.example](/Users/manojkumar/Developer/Littra/chat_engine/demo-app/.env.socket.example) for socket server vars.

## Notes

- Demo config is fetched from `GET /api/demo-config`.
- User token is fetched from `GET /api/demo-token?userId=<id>`.
- Chat messages are sent/received over Socket.IO.
- Typing and read-receipt events are live.
- If token expires, client auto-fetches a new token and retries once.
