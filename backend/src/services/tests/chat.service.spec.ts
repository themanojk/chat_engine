/// <reference types="jest" />

import { ChatService } from "../chat.service";
import { InMemoryChatAdapter } from "../../adapters/in-memory.adapter";
import { ChatError } from "../../errors/chat-error";

describe("ChatService validation", () => {
  it("throws validation error when sendMessage content is empty", async () => {
    const service = new ChatService(new InMemoryChatAdapter());

    const conversation = await service.createConversation({
      tenantId: "tenant-a",
      actorUserId: "user-a",
      type: "group",
      memberIds: ["user-a"],
    });

    await expect(
      service.sendMessage({
        tenantId: "tenant-a",
        actorUserId: "user-a",
        conversationId: conversation.id,
        content: "",
      }),
    ).rejects.toBeInstanceOf(ChatError);
  });

  it("throws validation error when createConversation has empty members", async () => {
    const service = new ChatService(new InMemoryChatAdapter());

    await expect(
      service.createConversation({
        tenantId: "tenant-a",
        actorUserId: "user-a",
        type: "group",
        memberIds: [],
      }),
    ).rejects.toBeInstanceOf(ChatError);
  });

  it("creates conversation, sends message and marks read", async () => {
    const service = new ChatService(new InMemoryChatAdapter());

    const conversation = await service.createConversation({
      tenantId: "tenant-a",
      actorUserId: "user-a",
      type: "group",
      memberIds: ["user-a", "user-b"],
    });

    const message = await service.sendMessage({
      tenantId: "tenant-a",
      actorUserId: "user-a",
      conversationId: conversation.id,
      content: "hello",
    });

    const receipt = await service.markRead({
      tenantId: "tenant-a",
      actorUserId: "user-b",
      conversationId: conversation.id,
      messageId: message.id,
    });

    expect(message.id).toBeTruthy();
    expect(receipt.messageId).toBe(message.id);
  });

  it("throws validation error when listMessages limit is invalid", async () => {
    const service = new ChatService(new InMemoryChatAdapter());

    await expect(
      service.listMessages({
        tenantId: "tenant-a",
        actorUserId: "user-a",
        conversationId: "conv-1",
        limit: 0,
      }),
    ).rejects.toBeInstanceOf(ChatError);
  });
});
