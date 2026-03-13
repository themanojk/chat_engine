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

function uniqueTenant(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

for (const testCase of matrix) {
  const describeIf = testCase.enabled ? describe : describe.skip;

  describeIf(`chat storage contract: ${testCase.name}`, () => {
    let service: ChatService;

    beforeEach(() => {
      service = new ChatService(testCase.createAdapter());
    });

    it("adds and removes members correctly", async () => {
      const tenantId = uniqueTenant("tenant-members");
      const owner = "owner";
      const userB = "user-b";
      const userC = "user-c";

      const conversation = await service.createConversation({
        tenantId,
        actorUserId: owner,
        type: "group",
        memberIds: [owner],
      });

      const afterAdd = await service.addMembers({
        tenantId,
        actorUserId: owner,
        conversationId: conversation.id,
        memberIds: [userB, userC],
      });

      expect(afterAdd.memberIds).toEqual(expect.arrayContaining([owner, userB, userC]));

      const afterRemove = await service.removeMember({
        tenantId,
        actorUserId: owner,
        conversationId: conversation.id,
        memberId: userC,
      });

      expect(afterRemove.memberIds).toEqual(expect.arrayContaining([owner, userB]));
      expect(afterRemove.memberIds).not.toContain(userC);
    });

    it("allows sender edit/delete and rejects non-sender", async () => {
      const tenantId = uniqueTenant("tenant-messages");
      const sender = "sender";
      const other = "other";

      const conversation = await service.createConversation({
        tenantId,
        actorUserId: sender,
        type: "group",
        memberIds: [sender, other],
      });

      const message = await service.sendMessage({
        tenantId,
        actorUserId: sender,
        conversationId: conversation.id,
        content: "original",
      });

      const edited = await service.editMessage({
        tenantId,
        actorUserId: sender,
        messageId: message.id,
        content: "updated",
      });

      expect(edited.content).toBe("updated");

      await expect(
        service.editMessage({
          tenantId,
          actorUserId: other,
          messageId: message.id,
          content: "hijack",
        }),
      ).rejects.toThrow();

      await expect(
        service.deleteMessage({
          tenantId,
          actorUserId: other,
          messageId: message.id,
        }),
      ).rejects.toThrow();

      await expect(
        service.deleteMessage({
          tenantId,
          actorUserId: sender,
          messageId: message.id,
        }),
      ).resolves.toBeUndefined();
    });

    it("supports beforeMessageId pagination", async () => {
      const tenantId = uniqueTenant("tenant-page");
      const user = "user-a";

      const conversation = await service.createConversation({
        tenantId,
        actorUserId: user,
        type: "group",
        memberIds: [user],
      });

      const first = await service.sendMessage({
        tenantId,
        actorUserId: user,
        conversationId: conversation.id,
        content: "first",
      });

      await service.sendMessage({
        tenantId,
        actorUserId: user,
        conversationId: conversation.id,
        content: "second",
      });

      const older = await service.listMessages({
        tenantId,
        actorUserId: user,
        conversationId: conversation.id,
        beforeMessageId: first.id,
        limit: 10,
      });

      expect(Array.isArray(older)).toBe(true);
    });

    it("enforces tenant isolation", async () => {
      const tenantA = uniqueTenant("tenant-a");
      const tenantB = uniqueTenant("tenant-b");
      const user = "user-a";

      const conversationA = await service.createConversation({
        tenantId: tenantA,
        actorUserId: user,
        type: "group",
        memberIds: [user],
      });

      await service.sendMessage({
        tenantId: tenantA,
        actorUserId: user,
        conversationId: conversationA.id,
        content: "hello from A",
      });

      await expect(
        service.listMessages({
          tenantId: tenantB,
          actorUserId: user,
          conversationId: conversationA.id,
        }),
      ).rejects.toThrow();
    });
  });
}
