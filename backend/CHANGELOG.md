# Changelog

All notable changes to `@littra/chat-engine-backend` will be documented in this file.

The format is based on Keep a Changelog and this project follows Semantic Versioning.

## [Unreleased]

### Added

- Multi-tenant `ChatModule` with pluggable storage (`in-memory`, `postgres`, `mongo`, `custom`).
- `ChatService` command API for conversations, messages, read receipts, and typing signals.
- Optional `ChatSocketServer` transport wiring for Socket.IO event handling.
- `NestChatModule` dynamic module wrapper with sync/async registration.
- Adapter matrix and module/service/error test suites.

### Changed

- Demo app socket server now consumes package exports instead of local duplicated chat logic.

## [0.1.0] - 2026-03-09

### Added

- Initial publish-ready package structure and exports.
- README usage guides for core module, Nest integration, and socket transport.
