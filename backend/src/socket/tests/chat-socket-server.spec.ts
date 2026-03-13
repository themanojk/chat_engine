/// <reference types="jest" />

import { createServer, Server as HttpServer } from "node:http";
import { AddressInfo } from "node:net";
import { io as createClient, Socket as ClientSocket } from "socket.io-client";
import { InMemoryChatAdapter } from "../../adapters/in-memory.adapter";
import { ChatService } from "../../services/chat.service";
import { ChatSocketServer } from "../chat-socket-server";

async function startHttpServer(server: HttpServer): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, () => {
      const address = server.address() as AddressInfo;
      resolve(address.port);
    });
  });
}

function closeHttpServer(server: HttpServer): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function connectClient(url: string, token = "token-1"): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const client = createClient(url, {
      transports: ["websocket"],
      auth: { token },
    });

    client.once("connect", () => resolve(client));
    client.once("connect_error", (error) => reject(error));
  });
}

function disconnectClient(client: ClientSocket): Promise<void> {
  return new Promise((resolve) => {
    client.once("disconnect", () => resolve());
    client.disconnect();
  });
}

function emitAck<T>(client: ClientSocket, event: string, payload: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    client.emit(event, payload, (response: T | { ok: false; error: { message: string } }) => {
      if (
        typeof response === "object" &&
        response !== null &&
        "ok" in response &&
        (response as { ok: boolean }).ok === false
      ) {
        reject(new Error((response as { error: { message: string } }).error.message));
        return;
      }
      resolve(response as T);
    });
  });
}

function waitForEvent<T>(client: ClientSocket, eventName: string): Promise<T> {
  return new Promise((resolve) => {
    client.once(eventName, (payload: T) => resolve(payload));
  });
}

const describeIf = process.env.TEST_SOCKET_ENABLED === "true" ? describe : describe.skip;

describeIf("ChatSocketServer", () => {
  let server: HttpServer;
  let socketServer: ChatSocketServer;
  let chatService: ChatService;
  let conversationId: string;
  let port: number;

  beforeEach(async () => {
    server = createServer();
    chatService = new ChatService(new InMemoryChatAdapter());

    const conversation = await chatService.createConversation({
      tenantId: "tenant-a",
      actorUserId: "user-a",
      type: "group",
      memberIds: ["user-a", "user-b"],
    });
    conversationId = conversation.id;

    socketServer = ChatSocketServer.attach({
      server,
      chatService,
      authProvider: ({ token }) => {
        if (!token) {
          throw new Error("Missing token");
        }
        return { tenantId: "tenant-a", userId: token === "token-2" ? "user-b" : "user-a" };
      },
    });

    port = await startHttpServer(server);
  });

  afterEach(async () => {
    socketServer.io.close();
    await closeHttpServer(server);
  });

  it("handles join and send_message events", async () => {
    const url = `http://localhost:${port}`;
    const clientA = await connectClient(url, "token-1");
    const clientB = await connectClient(url, "token-2");

    await emitAck(clientA, "join_conversation", { conversationId });
    await emitAck(clientB, "join_conversation", { conversationId });

    const received = new Promise<{ message: { content: string } }>((resolve) => {
      clientB.once("message_received", (event) => resolve(event));
    });

    await emitAck(clientA, "send_message", {
      conversationId,
      content: "hello socket",
    });

    const event = await received;
    expect(event.message.content).toBe("hello socket");

    await disconnectClient(clientA);
    await disconnectClient(clientB);
  });

  it("returns ack error when auth provider fails", async () => {
    const badServer = createServer();
    const badSocketServer = ChatSocketServer.attach({
      server: badServer,
      chatService,
      authProvider: () => {
        throw new Error("unauthorized");
      },
    });
    const badPort = await startHttpServer(badServer);

    await expect(connectClient(`http://localhost:${badPort}`, "")).rejects.toThrow();

    badSocketServer.io.close();
    await closeHttpServer(badServer);
  });

  it("broadcasts typing_started to other room members", async () => {
    const url = `http://localhost:${port}`;
    const clientA = await connectClient(url, "token-1");
    const clientB = await connectClient(url, "token-2");

    await emitAck(clientA, "join_conversation", { conversationId });
    await emitAck(clientB, "join_conversation", { conversationId });

    const typingEventPromise = waitForEvent<{ userId: string }>(clientB, "typing_started");
    await emitAck(clientA, "typing_start", { conversationId });

    const typingEvent = await typingEventPromise;
    expect(typingEvent.userId).toBe("user-a");

    await disconnectClient(clientA);
    await disconnectClient(clientB);
  });

  it("broadcasts read_receipt to room members", async () => {
    const url = `http://localhost:${port}`;
    const clientA = await connectClient(url, "token-1");
    const clientB = await connectClient(url, "token-2");

    await emitAck(clientA, "join_conversation", { conversationId });
    await emitAck(clientB, "join_conversation", { conversationId });

    const sent = await emitAck<{ message: { id: string } }>(clientA, "send_message", {
      conversationId,
      content: "for-read",
    });

    const receiptPromise = waitForEvent<{ messageId: string; userId: string }>(clientA, "read_receipt");
    await emitAck(clientB, "mark_read", {
      conversationId,
      messageId: sent.message.id,
    });

    const receipt = await receiptPromise;
    expect(receipt.messageId).toBe(sent.message.id);
    expect(receipt.userId).toBe("user-b");

    await disconnectClient(clientA);
    await disconnectClient(clientB);
  });

  it("supports custom event names and custom token extraction", async () => {
    const customServer = createServer();
    const customService = new ChatService(new InMemoryChatAdapter());
    const conv = await customService.createConversation({
      tenantId: "tenant-a",
      actorUserId: "user-a",
      type: "group",
      memberIds: ["user-a", "user-b"],
    });

    const customSocketServer = ChatSocketServer.attach({
      server: customServer,
      chatService: customService,
      authProvider: ({ token }) => {
        if (!token) {
          throw new Error("missing");
        }
        return { tenantId: "tenant-a", userId: token === "token-2" ? "user-b" : "user-a" };
      },
      getToken: (socket) => {
        const header = socket.handshake.headers["x-test-token"];
        return typeof header === "string" ? header : undefined;
      },
      eventNames: {
        joinConversation: "join_room",
        sendMessage: "send_msg",
        messageReceived: "msg_recv",
      },
    });

    const customPort = await startHttpServer(customServer);
    const url = `http://localhost:${customPort}`;

    const clientA = createClient(url, {
      transports: ["websocket"],
      extraHeaders: { "x-test-token": "token-1" },
    });
    const clientB = createClient(url, {
      transports: ["websocket"],
      extraHeaders: { "x-test-token": "token-2" },
    });

    await new Promise<void>((resolve, reject) => {
      clientA.once("connect", () => resolve());
      clientA.once("connect_error", (error) => reject(error));
    });
    await new Promise<void>((resolve, reject) => {
      clientB.once("connect", () => resolve());
      clientB.once("connect_error", (error) => reject(error));
    });

    await emitAck(clientA, "join_room", { conversationId: conv.id });
    await emitAck(clientB, "join_room", { conversationId: conv.id });

    const receivedPromise = waitForEvent<{ message: { content: string } }>(clientB, "msg_recv");
    await emitAck(clientA, "send_msg", { conversationId: conv.id, content: "custom-route" });

    const received = await receivedPromise;
    expect(received.message.content).toBe("custom-route");

    await disconnectClient(clientA);
    await disconnectClient(clientB);
    customSocketServer.io.close();
    await closeHttpServer(customServer);
  });
});
