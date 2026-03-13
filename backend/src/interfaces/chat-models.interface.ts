export interface ChatConversation {
  id: string;
  tenantId: string;
  type: "direct" | "group";
  title?: string;
  createdBy: string;
  memberIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatMessage {
  id: string;
  tenantId: string;
  conversationId: string;
  senderId: string;
  content: string;
  messageType: "text" | "system";
  createdAt: Date;
  editedAt?: Date;
  deletedAt?: Date;
}

export interface ReadReceipt {
  tenantId: string;
  conversationId: string;
  messageId: string;
  userId: string;
  readAt: Date;
}
