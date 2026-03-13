/// <reference types="jest" />

import { createServer as createHttpServer } from "node:http";
import { ChatService } from "../../services/chat.service";
import { InMemoryChatAdapter } from "../../adapters/in-memory.adapter";
import { ChatSocketServer } from "../chat-socket-server";

const ioToEmit = jest.fn();
const ioTo = jest.fn(() => ({ emit: ioToEmit }));
const ioUse = jest.fn();
const ioOn = jest.fn();
const ioClose = jest.fn();

jest.mock("socket.io", () => {
  return {
    Server: jest.fn(() => ({
      use: ioUse,
      on: ioOn,
      to: ioTo,
      close: ioClose,
    })),
  };
});

describe("ChatSocketServer unit", () => {
  beforeEach(() => {
    ioToEmit.mockReset();
    ioTo.mockReset().mockReturnValue({ emit: ioToEmit });
    ioUse.mockReset();
    ioOn.mockReset();
    ioClose.mockReset();
  });

  it("attach registers auth middleware and connection handler", () => {
    const httpServer = createHttpServer();
    const chatService = new ChatService(new InMemoryChatAdapter());

    ChatSocketServer.attach({
      server: httpServer,
      chatService,
      authProvider: () => ({ tenantId: "tenant-a", userId: "user-a" }),
    });

    expect(ioUse).toHaveBeenCalledTimes(1);
    expect(ioOn).toHaveBeenCalledWith("connection", expect.any(Function));
  });

  it("auth middleware maps provider failure to socket error", async () => {
    const httpServer = createHttpServer();
    const chatService = new ChatService(new InMemoryChatAdapter());

    ChatSocketServer.attach({
      server: httpServer,
      chatService,
      authProvider: () => {
        throw new Error("unauthorized token");
      },
    });

    const middleware = ioUse.mock.calls[0]?.[0] as ((socket: any, next: (err?: Error) => void) => Promise<void>) | undefined;
    expect(middleware).toBeDefined();

    const next = jest.fn();
    await middleware!({ handshake: { auth: {}, headers: {} }, data: {} }, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect((next.mock.calls[0]?.[0] as Error).message).toContain("UNAUTHORIZED:unauthorized token");
  });

  it("join_conversation joins expected room and send_message emits message_received", async () => {
    const httpServer = createHttpServer();
    const chatService = new ChatService(new InMemoryChatAdapter());
    const conversation = await chatService.createConversation({
      tenantId: "tenant-a",
      actorUserId: "user-a",
      type: "group",
      memberIds: ["user-a"],
    });

    ChatSocketServer.attach({
      server: httpServer,
      chatService,
      authProvider: () => ({ tenantId: "tenant-a", userId: "user-a" }),
    });

    const connectionHandler = ioOn.mock.calls.find((call) => call[0] === "connection")?.[1] as
      | ((socket: any) => void)
      | undefined;
    expect(connectionHandler).toBeDefined();

    const socketEventHandlers: Record<string, (...args: any[]) => unknown> = {};
    const socketToEmit = jest.fn();
    const fakeSocket = {
      data: { chatAuth: { tenantId: "tenant-a", userId: "user-a" } },
      on: jest.fn((event: string, handler: (...args: any[]) => unknown) => {
        socketEventHandlers[event] = handler;
      }),
      join: jest.fn().mockResolvedValue(undefined),
      leave: jest.fn().mockResolvedValue(undefined),
      to: jest.fn(() => ({ emit: socketToEmit })),
    };

    connectionHandler!(fakeSocket);

    const joinAck = jest.fn();
    await socketEventHandlers["join_conversation"]({ conversationId: conversation.id }, joinAck);
    expect(fakeSocket.join).toHaveBeenCalledWith(`tenant:tenant-a:conversation:${conversation.id}`);
    expect(joinAck).toHaveBeenCalledWith({ ok: true });

    const sendAck = jest.fn();
    await socketEventHandlers["send_message"](
      { conversationId: conversation.id, content: "hello world" },
      sendAck,
    );

    expect(ioTo).toHaveBeenCalledWith(`tenant:tenant-a:conversation:${conversation.id}`);
    expect(ioToEmit).toHaveBeenCalledWith(
      "message_received",
      expect.objectContaining({
        tenantId: "tenant-a",
        conversationId: conversation.id,
      }),
    );
    expect(sendAck).toHaveBeenCalledWith(
      expect.objectContaining({
        ok: true,
        message: expect.objectContaining({ content: "hello world" }),
      }),
    );
  });

  it("send_message returns ack error envelope on service failure", async () => {
    const httpServer = createHttpServer();
    const chatService = new ChatService(new InMemoryChatAdapter());

    jest.spyOn(chatService, "sendMessage").mockRejectedValue(new Error("boom"));

    ChatSocketServer.attach({
      server: httpServer,
      chatService,
      authProvider: () => ({ tenantId: "tenant-a", userId: "user-a" }),
    });

    const connectionHandler = ioOn.mock.calls.find((call) => call[0] === "connection")?.[1] as
      | ((socket: any) => void)
      | undefined;

    const socketEventHandlers: Record<string, (...args: any[]) => unknown> = {};
    const fakeSocket = {
      data: { chatAuth: { tenantId: "tenant-a", userId: "user-a" } },
      on: jest.fn((event: string, handler: (...args: any[]) => unknown) => {
        socketEventHandlers[event] = handler;
      }),
      join: jest.fn().mockResolvedValue(undefined),
      leave: jest.fn().mockResolvedValue(undefined),
      to: jest.fn(() => ({ emit: jest.fn() })),
    };

    connectionHandler!(fakeSocket);

    const sendAck = jest.fn();
    await socketEventHandlers["send_message"]({ conversationId: "c1", content: "x" }, sendAck);

    expect(sendAck).toHaveBeenCalledWith({
      ok: false,
      error: expect.objectContaining({
        code: "INTERNAL_ERROR",
      }),
    });
  });

  it("returns VALIDATION_ERROR ack when send_message payload is invalid", async () => {
    const httpServer = createHttpServer();
    const chatService = new ChatService(new InMemoryChatAdapter());

    ChatSocketServer.attach({
      server: httpServer,
      chatService,
      authProvider: () => ({ tenantId: "tenant-a", userId: "user-a" }),
    });

    const connectionHandler = ioOn.mock.calls.find((call) => call[0] === "connection")?.[1] as
      | ((socket: any) => void)
      | undefined;

    const socketEventHandlers: Record<string, (...args: any[]) => unknown> = {};
    const fakeSocket = {
      data: { chatAuth: { tenantId: "tenant-a", userId: "user-a" } },
      on: jest.fn((event: string, handler: (...args: any[]) => unknown) => {
        socketEventHandlers[event] = handler;
      }),
      join: jest.fn().mockResolvedValue(undefined),
      leave: jest.fn().mockResolvedValue(undefined),
      to: jest.fn(() => ({ emit: jest.fn() })),
    };

    connectionHandler!(fakeSocket);

    const sendAck = jest.fn();
    await socketEventHandlers["send_message"]({ content: "" }, sendAck);

    expect(sendAck).toHaveBeenCalledWith({
      ok: false,
      error: expect.objectContaining({
        code: "VALIDATION_ERROR",
      }),
    });
  });

  it("mark_read returns VALIDATION_ERROR ack when payload is invalid", async () => {
    const httpServer = createHttpServer();
    const chatService = new ChatService(new InMemoryChatAdapter());

    ChatSocketServer.attach({
      server: httpServer,
      chatService,
      authProvider: () => ({ tenantId: "tenant-a", userId: "user-a" }),
    });

    const connectionHandler = ioOn.mock.calls.find((call) => call[0] === "connection")?.[1] as
      | ((socket: any) => void)
      | undefined;

    const socketEventHandlers: Record<string, (...args: any[]) => unknown> = {};
    const fakeSocket = {
      data: { chatAuth: { tenantId: "tenant-a", userId: "user-a" } },
      on: jest.fn((event: string, handler: (...args: any[]) => unknown) => {
        socketEventHandlers[event] = handler;
      }),
      join: jest.fn().mockResolvedValue(undefined),
      leave: jest.fn().mockResolvedValue(undefined),
      to: jest.fn(() => ({ emit: jest.fn() })),
    };

    connectionHandler!(fakeSocket);

    const ack = jest.fn();
    await socketEventHandlers["mark_read"]({ conversationId: "c1" }, ack);

    expect(ack).toHaveBeenCalledWith({
      ok: false,
      error: expect.objectContaining({
        code: "VALIDATION_ERROR",
      }),
    });
  });
});
