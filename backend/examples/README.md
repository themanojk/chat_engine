# Consumer Integration Example

Use [consumer-socket-integration.ts](/Users/manojkumar/Developer/Littra/chat_engine/backend/examples/consumer-socket-integration.ts) as a template when your application owns the transport layer.

Key idea:

- `chat-engine` provides chat domain/service/storage abstractions.
- Your application provides:
  - socket server setup
  - authentication/token verification
  - room join/leave orchestration
  - event emission policy

This keeps the package reusable across NestJS, Express, and other host runtimes.
