import { ActorScope } from "./chat-context.interface";
import { ChatConversation, ChatMessage, ReadReceipt } from "./chat-models.interface";

export interface CreateConversationInput extends ActorScope {
  type: "direct" | "group";
  memberIds: string[];
  title?: string;
}

export interface AddMembersInput extends ActorScope {
  conversationId: string;
  memberIds: string[];
}

export interface RemoveMemberInput extends ActorScope {
  conversationId: string;
  memberId: string;
}

export interface SendMessageInput extends ActorScope {
  conversationId: string;
  content: string;
  messageType?: "text" | "system";
}

export interface EditMessageInput extends ActorScope {
  messageId: string;
  content: string;
}

export interface DeleteMessageInput extends ActorScope {
  messageId: string;
}

export interface MarkReadInput extends ActorScope {
  conversationId: string;
  messageId: string;
}

export interface TypingInput extends ActorScope {
  conversationId: string;
}

export interface ListMessagesInput extends ActorScope {
  conversationId: string;
  limit?: number;
  beforeMessageId?: string;
}

export interface ChatInputApi {
  createConversation(input: CreateConversationInput): Promise<ChatConversation>;
  addMembers(input: AddMembersInput): Promise<ChatConversation>;
  removeMember(input: RemoveMemberInput): Promise<ChatConversation>;
  sendMessage(input: SendMessageInput): Promise<ChatMessage>;
  editMessage(input: EditMessageInput): Promise<ChatMessage>;
  deleteMessage(input: DeleteMessageInput): Promise<void>;
  markRead(input: MarkReadInput): Promise<ReadReceipt>;
  startTyping(input: TypingInput): Promise<void>;
  stopTyping(input: TypingInput): Promise<void>;
  listMessages(input: ListMessagesInput): Promise<ChatMessage[]>;
}
