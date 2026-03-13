import { ReadReceipt, ChatMessage } from "./chat-models.interface";

export interface MessageEvent {
  tenantId: string;
  conversationId: string;
  message: ChatMessage;
}

export interface MessageDeletedEvent {
  tenantId: string;
  conversationId: string;
  messageId: string;
  deletedBy: string;
  deletedAt: Date;
}

export interface TypingEvent {
  tenantId: string;
  conversationId: string;
  userId: string;
  at: Date;
}

export interface PresenceEvent {
  tenantId: string;
  userId: string;
  at: Date;
}

export interface ChatOutputApi {
  onMessageReceived(handler: (event: MessageEvent) => void): () => void;
  onMessageEdited(handler: (event: MessageEvent) => void): () => void;
  onMessageDeleted(handler: (event: MessageDeletedEvent) => void): () => void;
  onTypingStarted(handler: (event: TypingEvent) => void): () => void;
  onTypingStopped(handler: (event: TypingEvent) => void): () => void;
  onReadReceipt(handler: (event: ReadReceipt) => void): () => void;
  onUserOnline(handler: (event: PresenceEvent) => void): () => void;
  onUserOffline(handler: (event: PresenceEvent) => void): () => void;
}
