/// <reference types="jest" />

import { ChatService } from "../../services/chat.service";
import { MongoAdapter } from "../mongo.adapter";

const describeIf =
  process.env.TEST_MONGO_URI && process.env.TEST_MONGO_ENABLED === "true"
    ? describe
    : describe.skip;

function uniqueTenant(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

describe("Mongo adapter (mocked)", () => {
  it("createConversation writes deduplicated memberIds including actor", async () => {
    const adapter = new MongoAdapter({
      uri: "mongodb://mocked",
      dbName: "mocked",
    });

    (adapter as any).ensureInitialized = jest.fn().mockResolvedValue(undefined);

    const insertOne = jest.fn().mockResolvedValue({ acknowledged: true });
    (adapter as any).conversations = jest.fn().mockReturnValue({
      insertOne,
    });

    const created = await adapter.createConversation({
      tenantId: "tenant-a",
      actorUserId: "user-a",
      type: "group",
      memberIds: ["user-a", "user-b", "user-b"],
    });

    expect(created.memberIds).toEqual(expect.arrayContaining(["user-a", "user-b"]));
    expect(created.memberIds.length).toBe(2);
    expect(insertOne).toHaveBeenCalledTimes(1);
  });

  it("editMessage rejects non-sender", async () => {
    const adapter = new MongoAdapter({
      uri: "mongodb://mocked",
      dbName: "mocked",
    });

    (adapter as any).ensureInitialized = jest.fn().mockResolvedValue(undefined);
    (adapter as any).messages = jest.fn().mockReturnValue({
      findOne: jest.fn().mockResolvedValue({
        _id: "m1",
        tenantId: "tenant-a",
        conversationId: "c1",
        senderId: "user-a",
        content: "x",
        messageType: "text",
        createdAt: new Date(),
      }),
      updateOne: jest.fn(),
    });

    await expect(
      adapter.editMessage({
        tenantId: "tenant-a",
        actorUserId: "user-b",
        messageId: "m1",
        content: "edited",
      }),
    ).rejects.toThrow("Only sender can edit message");
  });
});

describeIf("Mongo adapter integration", () => {
  let adapter: MongoAdapter;
  let service: ChatService;

  beforeEach(() => {
    adapter = new MongoAdapter({
      uri: process.env.TEST_MONGO_URI ?? "",
      dbName: process.env.TEST_MONGO_DB ?? "chat_engine_test",
    });
    service = new ChatService(adapter);
  });

  afterEach(async () => {
    await adapter.close();
  });

  it("supports create, send, edit, delete and read receipt flow", async () => {
    const tenantId = uniqueTenant("mongo-flow");
    const a = "user-a";
    const b = "user-b";

    const conversation = await service.createConversation({
      tenantId,
      actorUserId: a,
      type: "group",
      memberIds: [a, b],
    });

    const message = await service.sendMessage({
      tenantId,
      actorUserId: a,
      conversationId: conversation.id,
      content: "hello",
    });

    const edited = await service.editMessage({
      tenantId,
      actorUserId: a,
      messageId: message.id,
      content: "hello edited",
    });
    expect(edited.content).toBe("hello edited");

    const receipt = await service.markRead({
      tenantId,
      actorUserId: b,
      conversationId: conversation.id,
      messageId: message.id,
    });
    expect(receipt.userId).toBe(b);

    await expect(
      service.deleteMessage({
        tenantId,
        actorUserId: a,
        messageId: message.id,
      }),
    ).resolves.toBeUndefined();
  });
});
