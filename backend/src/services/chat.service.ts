import { ChatInputApi } from "../interfaces/chat-input.api";
import { ChatOutputApi } from "../interfaces/chat-output.api";
import { ChatStorageAdapter } from "../interfaces/chat-storage-adapter.interface";
import { ChatError } from "../errors/chat-error";

export class ChatService implements ChatInputApi, ChatOutputApi {
  constructor(private readonly storageAdapter: ChatStorageAdapter) {}

  async createConversation(input: Parameters<ChatInputApi["createConversation"]>[0]) {
    this.assertRequiredString(input.tenantId, "tenantId");
    this.assertRequiredString(input.actorUserId, "actorUserId");
    this.assertArrayWithValues(input.memberIds, "memberIds");
    if (input.type !== "direct" && input.type !== "group") {
      throw new ChatError("VALIDATION_ERROR", "type must be direct or group", 400);
    }
    return this.storageAdapter.createConversation(input);
  }

  async addMembers(input: Parameters<ChatInputApi["addMembers"]>[0]) {
    this.assertRequiredString(input.tenantId, "tenantId");
    this.assertRequiredString(input.actorUserId, "actorUserId");
    this.assertRequiredString(input.conversationId, "conversationId");
    this.assertArrayWithValues(input.memberIds, "memberIds");
    return this.storageAdapter.addMembers(input);
  }

  async removeMember(input: Parameters<ChatInputApi["removeMember"]>[0]) {
    this.assertRequiredString(input.tenantId, "tenantId");
    this.assertRequiredString(input.actorUserId, "actorUserId");
    this.assertRequiredString(input.conversationId, "conversationId");
    this.assertRequiredString(input.memberId, "memberId");
    return this.storageAdapter.removeMember(input);
  }

  async sendMessage(input: Parameters<ChatInputApi["sendMessage"]>[0]) {
    this.assertRequiredString(input.tenantId, "tenantId");
    this.assertRequiredString(input.actorUserId, "actorUserId");
    this.assertRequiredString(input.conversationId, "conversationId");
    this.assertRequiredString(input.content, "content");
    return this.storageAdapter.saveMessage(input);
  }

  async editMessage(input: Parameters<ChatInputApi["editMessage"]>[0]) {
    this.assertRequiredString(input.tenantId, "tenantId");
    this.assertRequiredString(input.actorUserId, "actorUserId");
    this.assertRequiredString(input.messageId, "messageId");
    this.assertRequiredString(input.content, "content");
    return this.storageAdapter.editMessage(input);
  }

  async deleteMessage(input: Parameters<ChatInputApi["deleteMessage"]>[0]) {
    this.assertRequiredString(input.tenantId, "tenantId");
    this.assertRequiredString(input.actorUserId, "actorUserId");
    this.assertRequiredString(input.messageId, "messageId");
    return this.storageAdapter.deleteMessage(input);
  }

  async markRead(input: Parameters<ChatInputApi["markRead"]>[0]) {
    this.assertRequiredString(input.tenantId, "tenantId");
    this.assertRequiredString(input.actorUserId, "actorUserId");
    this.assertRequiredString(input.conversationId, "conversationId");
    this.assertRequiredString(input.messageId, "messageId");
    return this.storageAdapter.markRead(input);
  }

  async startTyping(input: Parameters<ChatInputApi["startTyping"]>[0]): Promise<void> {
    this.assertRequiredString(input.tenantId, "tenantId");
    this.assertRequiredString(input.actorUserId, "actorUserId");
    this.assertRequiredString(input.conversationId, "conversationId");
    // Event publishing will be wired via gateway/event bus layer in the next step.
  }

  async stopTyping(input: Parameters<ChatInputApi["stopTyping"]>[0]): Promise<void> {
    this.assertRequiredString(input.tenantId, "tenantId");
    this.assertRequiredString(input.actorUserId, "actorUserId");
    this.assertRequiredString(input.conversationId, "conversationId");
    // Event publishing will be wired via gateway/event bus layer in the next step.
  }

  async listMessages(input: Parameters<ChatInputApi["listMessages"]>[0]) {
    this.assertRequiredString(input.tenantId, "tenantId");
    this.assertRequiredString(input.actorUserId, "actorUserId");
    this.assertRequiredString(input.conversationId, "conversationId");
    if (input.limit !== undefined && (!Number.isInteger(input.limit) || input.limit < 1)) {
      throw new ChatError("VALIDATION_ERROR", "limit must be a positive integer", 400);
    }
    return this.storageAdapter.listMessages(input);
  }

  onMessageReceived(_handler: Parameters<ChatOutputApi["onMessageReceived"]>[0]): () => void {
    return () => undefined;
  }

  onMessageEdited(_handler: Parameters<ChatOutputApi["onMessageEdited"]>[0]): () => void {
    return () => undefined;
  }

  onMessageDeleted(_handler: Parameters<ChatOutputApi["onMessageDeleted"]>[0]): () => void {
    return () => undefined;
  }

  onTypingStarted(_handler: Parameters<ChatOutputApi["onTypingStarted"]>[0]): () => void {
    return () => undefined;
  }

  onTypingStopped(_handler: Parameters<ChatOutputApi["onTypingStopped"]>[0]): () => void {
    return () => undefined;
  }

  onReadReceipt(_handler: Parameters<ChatOutputApi["onReadReceipt"]>[0]): () => void {
    return () => undefined;
  }

  onUserOnline(_handler: Parameters<ChatOutputApi["onUserOnline"]>[0]): () => void {
    return () => undefined;
  }

  onUserOffline(_handler: Parameters<ChatOutputApi["onUserOffline"]>[0]): () => void {
    return () => undefined;
  }

  private assertRequiredString(value: string | undefined, field: string): void {
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new ChatError("VALIDATION_ERROR", `${field} is required`, 400);
    }
  }

  private assertArrayWithValues(value: string[] | undefined, field: string): void {
    if (!Array.isArray(value) || value.length === 0) {
      throw new ChatError("VALIDATION_ERROR", `${field} must be a non-empty array`, 400);
    }

    const invalid = value.some((item) => typeof item !== "string" || item.trim().length === 0);
    if (invalid) {
      throw new ChatError("VALIDATION_ERROR", `${field} must only contain non-empty strings`, 400);
    }
  }
}
