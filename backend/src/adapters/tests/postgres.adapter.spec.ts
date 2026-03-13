/// <reference types="jest" />

import { ChatService } from "../../services/chat.service";
import { PostgresKnexAdapter } from "../postgres.adapter";

const describeIf =
  process.env.TEST_POSTGRES_URL && process.env.TEST_POSTGRES_ENABLED === "true"
    ? describe
    : describe.skip;

function uniqueTenant(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

describe("Postgres adapter (mocked)", () => {
  it("close calls underlying knex destroy", async () => {
    const adapter = new PostgresKnexAdapter({
      connectionString: "postgres://mocked",
    });

    const destroy = jest.fn().mockResolvedValue(undefined);
    (adapter as unknown as { db: { destroy: () => Promise<void> } }).db = { destroy };

    await adapter.close();
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it("editMessage rejects non-sender", async () => {
    const adapter = new PostgresKnexAdapter({
      connectionString: "postgres://mocked",
    });

    (adapter as any).ensureInitialized = jest.fn().mockResolvedValue(undefined);

    const first = jest
      .fn()
      .mockResolvedValueOnce({
        id: "m1",
        tenant_id: "tenant-a",
        conversation_id: "c1",
        sender_id: "user-a",
        content: "x",
        message_type: "text",
        created_at: new Date().toISOString(),
        edited_at: null,
        deleted_at: null,
      });

    const where = jest.fn().mockReturnValue({
      first,
      update: jest.fn(),
    });

    const fakeDb = jest.fn().mockReturnValue({ where });
    (adapter as unknown as { db: unknown }).db = fakeDb;

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

describeIf("Postgres adapter integration", () => {
  let adapter: PostgresKnexAdapter;
  let service: ChatService;

  beforeEach(() => {
    adapter = new PostgresKnexAdapter({
      connectionString: process.env.TEST_POSTGRES_URL,
    });
    service = new ChatService(adapter);
  });

  afterEach(async () => {
    await adapter.close();
  });

  it("supports create, send, edit, delete and read receipt flow", async () => {
    const tenantId = uniqueTenant("pg-flow");
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
