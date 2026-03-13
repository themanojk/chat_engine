import { randomUUID } from "node:crypto";
import knex, { Knex } from "knex";
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

export interface PostgresAdapterConfig {
  connectionString?: string;
  knexConfig?: Record<string, unknown>;
  autoCreateSchema?: boolean;
}

type ConversationRow = {
  id: string;
  tenant_id: string;
  type: "direct" | "group";
  title: string | null;
  created_by: string;
  created_at: Date | string;
  updated_at: Date | string;
};

type MessageRow = {
  id: string;
  tenant_id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  message_type: "text" | "system";
  created_at: Date | string;
  edited_at: Date | string | null;
  deleted_at: Date | string | null;
};

export class PostgresKnexAdapter implements ChatStorageAdapter {
  private readonly db: Knex;
  private initPromise?: Promise<void>;

  constructor(private readonly config: PostgresAdapterConfig = {}) {
    const effectiveConfig: Knex.Config = (config.knexConfig as Knex.Config | undefined) ?? {
      client: "pg",
      connection: config.connectionString ?? "postgres://localhost:5432/chat_engine",
      pool: { min: 0, max: 10 },
    };

    this.db = knex(effectiveConfig);
  }

  getConfig(): PostgresAdapterConfig {
    return this.config;
  }

  async createConversation(input: CreateConversationInput): Promise<ChatConversation> {
    await this.ensureInitialized();

    const now = new Date();
    const conversationId = randomUUID();
    const memberIds = Array.from(new Set([...input.memberIds, input.actorUserId]));

    await this.db.transaction(async (trx) => {
      await trx("conversations").insert({
        id: conversationId,
        tenant_id: input.tenantId,
        type: input.type,
        title: input.title ?? null,
        created_by: input.actorUserId,
        created_at: now,
        updated_at: now,
      });

      const memberRows = memberIds.map((userId) => ({
        id: randomUUID(),
        tenant_id: input.tenantId,
        conversation_id: conversationId,
        user_id: userId,
        added_at: now,
      }));

      if (memberRows.length > 0) {
        await trx("conversation_members").insert(memberRows);
      }
    });

    return this.getConversationById(input.tenantId, conversationId);
  }

  async addMembers(input: AddMembersInput): Promise<ChatConversation> {
    await this.ensureInitialized();
    await this.assertConversationMembership(input.tenantId, input.conversationId, input.actorUserId);

    const now = new Date();
    const uniqueMemberIds = Array.from(new Set(input.memberIds));

    if (uniqueMemberIds.length > 0) {
      const rows = uniqueMemberIds.map((userId) => ({
        id: randomUUID(),
        tenant_id: input.tenantId,
        conversation_id: input.conversationId,
        user_id: userId,
        added_at: now,
      }));

      await this.db("conversation_members")
        .insert(rows)
        .onConflict(["tenant_id", "conversation_id", "user_id"])
        .ignore();
    }

    await this.db("conversations")
      .where({ id: input.conversationId, tenant_id: input.tenantId })
      .update({ updated_at: now });

    return this.getConversationById(input.tenantId, input.conversationId);
  }

  async removeMember(input: RemoveMemberInput): Promise<ChatConversation> {
    await this.ensureInitialized();
    await this.assertConversationMembership(input.tenantId, input.conversationId, input.actorUserId);

    await this.db("conversation_members")
      .where({
        tenant_id: input.tenantId,
        conversation_id: input.conversationId,
        user_id: input.memberId,
      })
      .delete();

    await this.db("conversations")
      .where({ id: input.conversationId, tenant_id: input.tenantId })
      .update({ updated_at: new Date() });

    return this.getConversationById(input.tenantId, input.conversationId);
  }

  async saveMessage(input: SendMessageInput): Promise<ChatMessage> {
    await this.ensureInitialized();
    await this.assertConversationMembership(input.tenantId, input.conversationId, input.actorUserId);

    const row: MessageRow = {
      id: randomUUID(),
      tenant_id: input.tenantId,
      conversation_id: input.conversationId,
      sender_id: input.actorUserId,
      content: input.content,
      message_type: input.messageType ?? "text",
      created_at: new Date(),
      edited_at: null,
      deleted_at: null,
    };

    await this.db("messages").insert(row);

    return this.mapMessage(row);
  }

  async editMessage(input: EditMessageInput): Promise<ChatMessage> {
    await this.ensureInitialized();

    const existing = await this.db("messages")
      .where({ id: input.messageId, tenant_id: input.tenantId })
      .first<MessageRow>();

    if (!existing) {
      throw new Error("Message not found");
    }

    if (existing.sender_id !== input.actorUserId) {
      throw new Error("Only sender can edit message");
    }

    await this.db("messages")
      .where({ id: input.messageId, tenant_id: input.tenantId })
      .update({
        content: input.content,
        edited_at: new Date(),
      });

    const updated = await this.db("messages")
      .where({ id: input.messageId, tenant_id: input.tenantId })
      .first<MessageRow>();

    if (!updated) {
      throw new Error("Message not found after update");
    }

    return this.mapMessage(updated);
  }

  async deleteMessage(input: DeleteMessageInput): Promise<void> {
    await this.ensureInitialized();

    const existing = await this.db("messages")
      .where({ id: input.messageId, tenant_id: input.tenantId })
      .first<MessageRow>();

    if (!existing) {
      throw new Error("Message not found");
    }

    if (existing.sender_id !== input.actorUserId) {
      throw new Error("Only sender can delete message");
    }

    await this.db("messages")
      .where({ id: input.messageId, tenant_id: input.tenantId })
      .update({ deleted_at: new Date() });
  }

  async listMessages(input: ListMessagesInput): Promise<ChatMessage[]> {
    await this.ensureInitialized();
    await this.assertConversationMembership(input.tenantId, input.conversationId, input.actorUserId);

    const limit = Math.max(1, Math.min(input.limit ?? 50, 200));
    let query = this.db("messages")
      .where({
        tenant_id: input.tenantId,
        conversation_id: input.conversationId,
      })
      .orderBy("created_at", "desc")
      .limit(limit);

    if (input.beforeMessageId) {
      const beforeMessage = await this.db("messages")
        .where({
          id: input.beforeMessageId,
          tenant_id: input.tenantId,
          conversation_id: input.conversationId,
        })
        .first<MessageRow>();

      if (beforeMessage) {
        query = query.andWhere("created_at", "<", beforeMessage.created_at);
      }
    }

    const rows = await query;
    return rows.map((row) => this.mapMessage(row as MessageRow));
  }

  async markRead(input: MarkReadInput): Promise<ReadReceipt> {
    await this.ensureInitialized();
    await this.assertConversationMembership(input.tenantId, input.conversationId, input.actorUserId);

    const message = await this.db("messages")
      .where({
        id: input.messageId,
        tenant_id: input.tenantId,
        conversation_id: input.conversationId,
      })
      .first<MessageRow>();

    if (!message) {
      throw new Error("Message not found");
    }

    const readAt = new Date();

    await this.db("read_receipts")
      .insert({
        tenant_id: input.tenantId,
        conversation_id: input.conversationId,
        message_id: input.messageId,
        user_id: input.actorUserId,
        read_at: readAt,
      })
      .onConflict(["tenant_id", "conversation_id", "message_id", "user_id"])
      .merge({ read_at: readAt });

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
      this.initPromise = this.config.autoCreateSchema === false
        ? Promise.resolve()
        : this.ensureSchema();
    }

    await this.initPromise;
  }

  private async ensureSchema(): Promise<void> {
    const hasConversations = await this.db.schema.hasTable("conversations");
    if (!hasConversations) {
      await this.db.schema.createTable("conversations", (table) => {
        table.text("id").primary();
        table.text("tenant_id").notNullable();
        table.text("type").notNullable();
        table.text("title").nullable();
        table.text("created_by").notNullable();
        table.timestamp("created_at", { useTz: true }).notNullable();
        table.timestamp("updated_at", { useTz: true }).notNullable();
      });
      await this.db.schema.alterTable("conversations", (table) => {
        table.index(["tenant_id", "id"], "idx_conversations_tenant_id_id");
      });
    }

    const hasConversationMembers = await this.db.schema.hasTable("conversation_members");
    if (!hasConversationMembers) {
      await this.db.schema.createTable("conversation_members", (table) => {
        table.text("id").primary();
        table.text("tenant_id").notNullable();
        table.text("conversation_id").notNullable();
        table.text("user_id").notNullable();
        table.timestamp("added_at", { useTz: true }).notNullable();
        table.unique(
          ["tenant_id", "conversation_id", "user_id"],
          { indexName: "uq_conversation_members_tenant_conversation_user" },
        );
      });
      await this.db.schema.alterTable("conversation_members", (table) => {
        table.index(["tenant_id", "conversation_id"], "idx_conversation_members_tenant_conversation");
      });
    }

    const hasMessages = await this.db.schema.hasTable("messages");
    if (!hasMessages) {
      await this.db.schema.createTable("messages", (table) => {
        table.text("id").primary();
        table.text("tenant_id").notNullable();
        table.text("conversation_id").notNullable();
        table.text("sender_id").notNullable();
        table.text("content").notNullable();
        table.text("message_type").notNullable();
        table.timestamp("created_at", { useTz: true }).notNullable();
        table.timestamp("edited_at", { useTz: true }).nullable();
        table.timestamp("deleted_at", { useTz: true }).nullable();
      });
      await this.db.schema.alterTable("messages", (table) => {
        table.index(["tenant_id", "conversation_id", "created_at"], "idx_messages_tenant_conversation_created");
      });
    }

    const hasReadReceipts = await this.db.schema.hasTable("read_receipts");
    if (!hasReadReceipts) {
      await this.db.schema.createTable("read_receipts", (table) => {
        table.text("tenant_id").notNullable();
        table.text("conversation_id").notNullable();
        table.text("message_id").notNullable();
        table.text("user_id").notNullable();
        table.timestamp("read_at", { useTz: true }).notNullable();
        table.primary(
          ["tenant_id", "conversation_id", "message_id", "user_id"],
          { constraintName: "pk_read_receipts_tenant_conversation_message_user" },
        );
      });
      await this.db.schema.alterTable("read_receipts", (table) => {
        table.index(["tenant_id", "conversation_id"], "idx_read_receipts_tenant_conversation");
      });
    }
  }

  private async assertConversationMembership(
    tenantId: string,
    conversationId: string,
    userId: string,
  ): Promise<void> {
    const membership = await this.db("conversation_members")
      .where({
        tenant_id: tenantId,
        conversation_id: conversationId,
        user_id: userId,
      })
      .first();

    if (!membership) {
      throw new Error("User is not a member of this conversation");
    }
  }

  private async getConversationById(tenantId: string, conversationId: string): Promise<ChatConversation> {
    const conversation = await this.db("conversations")
      .where({ id: conversationId, tenant_id: tenantId })
      .first<ConversationRow>();

    if (!conversation) {
      throw new Error("Conversation not found");
    }

    const members = await this.db("conversation_members")
      .select<{ user_id: string }[]>("user_id")
      .where({ tenant_id: tenantId, conversation_id: conversationId });

    return {
      id: conversation.id,
      tenantId: conversation.tenant_id,
      type: conversation.type,
      title: conversation.title ?? undefined,
      createdBy: conversation.created_by,
      memberIds: members.map((m) => m.user_id),
      createdAt: new Date(conversation.created_at),
      updatedAt: new Date(conversation.updated_at),
    };
  }

  private mapMessage(row: MessageRow): ChatMessage {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      conversationId: row.conversation_id,
      senderId: row.sender_id,
      content: row.content,
      messageType: row.message_type,
      createdAt: new Date(row.created_at),
      editedAt: row.edited_at ? new Date(row.edited_at) : undefined,
      deletedAt: row.deleted_at ? new Date(row.deleted_at) : undefined,
    };
  }

  async close(): Promise<void> {
    await this.db.destroy();
  }
}
