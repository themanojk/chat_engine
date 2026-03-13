import { randomUUID } from "node:crypto";
import { Collection, Db, MongoClient } from "mongodb";
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

export interface MongoAdapterConfig {
  uri: string;
  dbName?: string;
}

type ConversationDocument = {
  _id: string;
  tenantId: string;
  type: "direct" | "group";
  title?: string;
  createdBy: string;
  memberIds: string[];
  createdAt: Date;
  updatedAt: Date;
};

type MessageDocument = {
  _id: string;
  tenantId: string;
  conversationId: string;
  senderId: string;
  content: string;
  messageType: "text" | "system";
  createdAt: Date;
  editedAt?: Date;
  deletedAt?: Date;
};

type ReadReceiptDocument = {
  _id: string;
  tenantId: string;
  conversationId: string;
  messageId: string;
  userId: string;
  readAt: Date;
};

export class MongoAdapter implements ChatStorageAdapter {
  private client?: MongoClient;
  private db?: Db;
  private initPromise?: Promise<void>;

  constructor(private readonly config: MongoAdapterConfig) {}

  getConfig(): MongoAdapterConfig {
    return this.config;
  }

  async createConversation(input: CreateConversationInput): Promise<ChatConversation> {
    await this.ensureInitialized();

    const now = new Date();
    const conversationId = randomUUID();
    const memberIds = Array.from(new Set([...input.memberIds, input.actorUserId]));

    const doc: ConversationDocument = {
      _id: conversationId,
      tenantId: input.tenantId,
      type: input.type,
      title: input.title,
      createdBy: input.actorUserId,
      memberIds,
      createdAt: now,
      updatedAt: now,
    };

    await this.conversations().insertOne(doc);
    return this.mapConversation(doc);
  }

  async addMembers(input: AddMembersInput): Promise<ChatConversation> {
    await this.ensureInitialized();
    await this.assertConversationMembership(input.tenantId, input.conversationId, input.actorUserId);

    await this.conversations().updateOne(
      { _id: input.conversationId, tenantId: input.tenantId },
      {
        $addToSet: { memberIds: { $each: input.memberIds } },
        $set: { updatedAt: new Date() },
      },
    );

    return this.getConversationById(input.tenantId, input.conversationId);
  }

  async removeMember(input: RemoveMemberInput): Promise<ChatConversation> {
    await this.ensureInitialized();
    await this.assertConversationMembership(input.tenantId, input.conversationId, input.actorUserId);

    await this.conversations().updateOne(
      { _id: input.conversationId, tenantId: input.tenantId },
      {
        $pull: { memberIds: input.memberId },
        $set: { updatedAt: new Date() },
      },
    );

    return this.getConversationById(input.tenantId, input.conversationId);
  }

  async saveMessage(input: SendMessageInput): Promise<ChatMessage> {
    await this.ensureInitialized();
    await this.assertConversationMembership(input.tenantId, input.conversationId, input.actorUserId);

    const doc: MessageDocument = {
      _id: randomUUID(),
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      senderId: input.actorUserId,
      content: input.content,
      messageType: input.messageType ?? "text",
      createdAt: new Date(),
    };

    await this.messages().insertOne(doc);
    return this.mapMessage(doc);
  }

  async editMessage(input: EditMessageInput): Promise<ChatMessage> {
    await this.ensureInitialized();

    const existing = await this.messages().findOne({ _id: input.messageId, tenantId: input.tenantId });
    if (!existing) {
      throw new Error("Message not found");
    }

    if (existing.senderId !== input.actorUserId) {
      throw new Error("Only sender can edit message");
    }

    const editedAt = new Date();
    await this.messages().updateOne(
      { _id: input.messageId, tenantId: input.tenantId },
      { $set: { content: input.content, editedAt } },
    );

    return {
      ...this.mapMessage(existing),
      content: input.content,
      editedAt,
    };
  }

  async deleteMessage(input: DeleteMessageInput): Promise<void> {
    await this.ensureInitialized();

    const existing = await this.messages().findOne({ _id: input.messageId, tenantId: input.tenantId });
    if (!existing) {
      throw new Error("Message not found");
    }

    if (existing.senderId !== input.actorUserId) {
      throw new Error("Only sender can delete message");
    }

    await this.messages().updateOne(
      { _id: input.messageId, tenantId: input.tenantId },
      { $set: { deletedAt: new Date() } },
    );
  }

  async listMessages(input: ListMessagesInput): Promise<ChatMessage[]> {
    await this.ensureInitialized();
    await this.assertConversationMembership(input.tenantId, input.conversationId, input.actorUserId);

    const limit = Math.max(1, Math.min(input.limit ?? 50, 200));
    let createdAtFilter: Date | undefined;

    if (input.beforeMessageId) {
      const beforeMessage = await this.messages().findOne({
        _id: input.beforeMessageId,
        tenantId: input.tenantId,
        conversationId: input.conversationId,
      });
      createdAtFilter = beforeMessage?.createdAt;
    }

    const filter: Record<string, unknown> = {
      tenantId: input.tenantId,
      conversationId: input.conversationId,
    };

    if (createdAtFilter) {
      filter.createdAt = { $lt: createdAtFilter };
    }

    const rows = await this.messages()
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();

    return rows.map((row) => this.mapMessage(row));
  }

  async markRead(input: MarkReadInput): Promise<ReadReceipt> {
    await this.ensureInitialized();
    await this.assertConversationMembership(input.tenantId, input.conversationId, input.actorUserId);

    const message = await this.messages().findOne({
      _id: input.messageId,
      tenantId: input.tenantId,
      conversationId: input.conversationId,
    });

    if (!message) {
      throw new Error("Message not found");
    }

    const readAt = new Date();
    const receiptId = `${input.tenantId}:${input.conversationId}:${input.messageId}:${input.actorUserId}`;

    await this.readReceipts().updateOne(
      { _id: receiptId },
      {
        $set: {
          tenantId: input.tenantId,
          conversationId: input.conversationId,
          messageId: input.messageId,
          userId: input.actorUserId,
          readAt,
        },
      },
      { upsert: true },
    );

    return {
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      messageId: input.messageId,
      userId: input.actorUserId,
      readAt,
    };
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.init();
    }
    await this.initPromise;
  }

  private async init(): Promise<void> {
    this.client = new MongoClient(this.config.uri);
    await this.client.connect();
    this.db = this.client.db(this.config.dbName ?? "chat_engine");

    await Promise.all([
      this.conversations().createIndex({ tenantId: 1, _id: 1 }, { unique: true }),
      this.conversations().createIndex({ tenantId: 1, memberIds: 1 }),
      this.messages().createIndex({ tenantId: 1, conversationId: 1, createdAt: -1 }),
      this.readReceipts().createIndex({ tenantId: 1, conversationId: 1, userId: 1 }),
    ]);
  }

  private conversations(): Collection<ConversationDocument> {
    if (!this.db) {
      throw new Error("Mongo adapter is not initialized");
    }
    return this.db.collection<ConversationDocument>("conversations");
  }

  private messages(): Collection<MessageDocument> {
    if (!this.db) {
      throw new Error("Mongo adapter is not initialized");
    }
    return this.db.collection<MessageDocument>("messages");
  }

  private readReceipts(): Collection<ReadReceiptDocument> {
    if (!this.db) {
      throw new Error("Mongo adapter is not initialized");
    }
    return this.db.collection<ReadReceiptDocument>("read_receipts");
  }

  private async assertConversationMembership(
    tenantId: string,
    conversationId: string,
    userId: string,
  ): Promise<void> {
    const conversation = await this.conversations().findOne({
      _id: conversationId,
      tenantId,
      memberIds: userId,
    });

    if (!conversation) {
      throw new Error("User is not a member of this conversation");
    }
  }

  private async getConversationById(tenantId: string, conversationId: string): Promise<ChatConversation> {
    const conversation = await this.conversations().findOne({ _id: conversationId, tenantId });
    if (!conversation) {
      throw new Error("Conversation not found");
    }
    return this.mapConversation(conversation);
  }

  private mapConversation(doc: ConversationDocument): ChatConversation {
    return {
      id: doc._id,
      tenantId: doc.tenantId,
      type: doc.type,
      title: doc.title,
      createdBy: doc.createdBy,
      memberIds: doc.memberIds,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  private mapMessage(doc: MessageDocument): ChatMessage {
    return {
      id: doc._id,
      tenantId: doc.tenantId,
      conversationId: doc.conversationId,
      senderId: doc.senderId,
      content: doc.content,
      messageType: doc.messageType,
      createdAt: doc.createdAt,
      editedAt: doc.editedAt,
      deletedAt: doc.deletedAt,
    };
  }

  async close(): Promise<void> {
    await this.client?.close();
    this.client = undefined;
    this.db = undefined;
  }
}
