/// <reference types="jest" />

import { ChatService } from "../../services/chat.service";
import { InMemoryChatAdapter } from "../in-memory.adapter";
import { PostgresKnexAdapter } from "../postgres.adapter";
import { MongoAdapter } from "../mongo.adapter";
import { ChatStorageAdapter } from "../../interfaces/chat-storage-adapter.interface";

type AdapterFactory = () => ChatStorageAdapter;

type MatrixCase = {
  name: string;
  enabled: boolean;
  createAdapter: AdapterFactory;
};

const matrix: MatrixCase[] = [
  {
    name: "in-memory",
    enabled: true,
    createAdapter: () => new InMemoryChatAdapter(),
  },
  {
    name: "postgres",
    enabled: Boolean(process.env.TEST_POSTGRES_URL) && process.env.TEST_POSTGRES_ENABLED === "true",
    createAdapter: () =>
      new PostgresKnexAdapter({
        connectionString: process.env.TEST_POSTGRES_URL,
      }),
  },
  {
    name: "mongo",
    enabled: Boolean(process.env.TEST_MONGO_URI) && process.env.TEST_MONGO_ENABLED === "true",
    createAdapter: () =>
      new MongoAdapter({
        uri: process.env.TEST_MONGO_URI ?? "",
        dbName: process.env.TEST_MONGO_DB ?? "chat_engine_test",
      }),
  },
];

for (const testCase of matrix) {
  const describeIf = testCase.enabled ? describe : describe.skip;

  describeIf(`chat behavior matrix: ${testCase.name}`, () => {
    const tenantId = "tenant-test";
    const actorA = "user-a";
    const actorB = "user-b";
    let service: ChatService;

    beforeEach(() => {
      service = new ChatService(testCase.createAdapter());
    });

    it("creates a conversation, sends messages and lists them", async () => {
      const conversation = await service.createConversation({
        tenantId,
        actorUserId: actorA,
        type: "group",
        memberIds: [actorA, actorB],
        title: "matrix room",
      });

      expect(conversation.id).toBeTruthy();
      expect(conversation.memberIds).toEqual(expect.arrayContaining([actorA, actorB]));

      const firstMessage = await service.sendMessage({
        tenantId,
        actorUserId: actorA,
        conversationId: conversation.id,
        content: "hello",
      });

      await service.sendMessage({
        tenantId,
        actorUserId: actorB,
        conversationId: conversation.id,
        content: "hi",
      });

      const messages = await service.listMessages({
        tenantId,
        actorUserId: actorA,
        conversationId: conversation.id,
        limit: 10,
      });

      expect(messages.length).toBeGreaterThanOrEqual(2);
      expect(messages.map((m) => m.id)).toContain(firstMessage.id);
    });

    it("supports read receipt lifecycle", async () => {
      const conversation = await service.createConversation({
        tenantId,
        actorUserId: actorA,
        type: "group",
        memberIds: [actorA, actorB],
      });

      const message = await service.sendMessage({
        tenantId,
        actorUserId: actorA,
        conversationId: conversation.id,
        content: "read me",
      });

      const receipt = await service.markRead({
        tenantId,
        actorUserId: actorB,
        conversationId: conversation.id,
        messageId: message.id,
      });

      expect(receipt.messageId).toBe(message.id);
      expect(receipt.userId).toBe(actorB);
    });

    it("enforces membership for send/list", async () => {
      const conversation = await service.createConversation({
        tenantId,
        actorUserId: actorA,
        type: "group",
        memberIds: [actorA],
      });

      await expect(
        service.sendMessage({
          tenantId,
          actorUserId: "intruder",
          conversationId: conversation.id,
          content: "not allowed",
        }),
      ).rejects.toThrow();

      await expect(
        service.listMessages({
          tenantId,
          actorUserId: "intruder",
          conversationId: conversation.id,
        }),
      ).rejects.toThrow();
    });
  });
}
