import { randomUUID } from "node:crypto";
import {
  AddMembersInput,
  CreateConversationInput,
  DeleteMessageInput,
  EditMessageInput,
  ListMessagesInput,
  MarkReadInput,
  RemoveMemberInput,
  SendMessageInput,
} from "../interfaces/chat-input.api";
import { ChatConversation, ChatMessage, ReadReceipt } from "../interfaces/chat-models.interface";
import { ChatStorageAdapter } from "../interfaces/chat-storage-adapter.interface";

export class InMemoryChatAdapter implements ChatStorageAdapter {
  private readonly conversations = new Map<string, ChatConversation>();
  private readonly messages = new Map<string, ChatMessage>();
  private readonly receipts = new Map<string, ReadReceipt>();

  async createConversation(input: CreateConversationInput): Promise<ChatConversation> {
    const now = new Date();
    const id = randomUUID();
    const memberIds = Array.from(new Set([...input.memberIds, input.actorUserId]));
    const conversation: ChatConversation = {
      id,
      tenantId: input.tenantId,
      type: input.type,
      title: input.title,
      createdBy: input.actorUserId,
      memberIds,
      createdAt: now,
      updatedAt: now,
    };
    this.conversations.set(this.conversationKey(input.tenantId, id), conversation);
    return conversation;
  }

  async addMembers(input: AddMembersInput): Promise<ChatConversation> {
    const conversation = this.requireConversation(input.tenantId, input.conversationId);
    this.assertMembership(conversation, input.actorUserId);
    conversation.memberIds = Array.from(new Set([...conversation.memberIds, ...input.memberIds]));
    conversation.updatedAt = new Date();
    return conversation;
  }

  async removeMember(input: RemoveMemberInput): Promise<ChatConversation> {
    const conversation = this.requireConversation(input.tenantId, input.conversationId);
    this.assertMembership(conversation, input.actorUserId);
    conversation.memberIds = conversation.memberIds.filter((id) => id !== input.memberId);
    conversation.updatedAt = new Date();
    return conversation;
  }

  async saveMessage(input: SendMessageInput): Promise<ChatMessage> {
    const conversation = this.requireConversation(input.tenantId, input.conversationId);
    this.assertMembership(conversation, input.actorUserId);

    const message: ChatMessage = {
      id: randomUUID(),
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      senderId: input.actorUserId,
      content: input.content,
      messageType: input.messageType ?? "text",
      createdAt: new Date(),
    };
    this.messages.set(this.messageKey(input.tenantId, message.id), message);
    return message;
  }

  async editMessage(input: EditMessageInput): Promise<ChatMessage> {
    const message = this.requireMessage(input.tenantId, input.messageId);
    if (message.senderId !== input.actorUserId) {
      throw new Error("Only sender can edit message");
    }
    message.content = input.content;
    message.editedAt = new Date();
    return message;
  }

  async deleteMessage(input: DeleteMessageInput): Promise<void> {
    const message = this.requireMessage(input.tenantId, input.messageId);
    if (message.senderId !== input.actorUserId) {
      throw new Error("Only sender can delete message");
    }
    message.deletedAt = new Date();
  }

  async listMessages(input: ListMessagesInput): Promise<ChatMessage[]> {
    const conversation = this.requireConversation(input.tenantId, input.conversationId);
    this.assertMembership(conversation, input.actorUserId);

    const limit = Math.max(1, Math.min(input.limit ?? 50, 200));
    let items = Array.from(this.messages.values())
      .filter(
        (message) =>
          message.tenantId === input.tenantId &&
          message.conversationId === input.conversationId,
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    if (input.beforeMessageId) {
      const before = items.find((message) => message.id === input.beforeMessageId);
      if (before) {
        items = items.filter((message) => message.createdAt < before.createdAt);
      }
    }

    return items.slice(0, limit);
  }

  async markRead(input: MarkReadInput): Promise<ReadReceipt> {
    this.requireConversation(input.tenantId, input.conversationId);
    this.requireMessage(input.tenantId, input.messageId);

    const receipt: ReadReceipt = {
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      messageId: input.messageId,
      userId: input.actorUserId,
      readAt: new Date(),
    };
    this.receipts.set(this.receiptKey(receipt), receipt);
    return receipt;
  }

  private conversationKey(tenantId: string, conversationId: string): string {
    return `${tenantId}:${conversationId}`;
  }

  private messageKey(tenantId: string, messageId: string): string {
    return `${tenantId}:${messageId}`;
  }

  private receiptKey(receipt: ReadReceipt): string {
    return `${receipt.tenantId}:${receipt.conversationId}:${receipt.messageId}:${receipt.userId}`;
  }

  private requireConversation(tenantId: string, conversationId: string): ChatConversation {
    const conversation = this.conversations.get(this.conversationKey(tenantId, conversationId));
    if (!conversation) {
      throw new Error("Conversation not found");
    }
    return conversation;
  }

  private requireMessage(tenantId: string, messageId: string): ChatMessage {
    const message = this.messages.get(this.messageKey(tenantId, messageId));
    if (!message) {
      throw new Error("Message not found");
    }
    return message;
  }

  private assertMembership(conversation: ChatConversation, userId: string): void {
    if (!conversation.memberIds.includes(userId)) {
      throw new Error("User is not a member of this conversation");
    }
  }
}
