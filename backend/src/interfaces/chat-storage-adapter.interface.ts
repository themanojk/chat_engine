import {
  AddMembersInput,
  CreateConversationInput,
  DeleteMessageInput,
  EditMessageInput,
  ListMessagesInput,
  MarkReadInput,
  RemoveMemberInput,
  SendMessageInput,
} from "./chat-input.api";
import { ChatConversation, ChatMessage, ReadReceipt } from "./chat-models.interface";

export interface ChatStorageAdapter {
  createConversation(input: CreateConversationInput): Promise<ChatConversation>;
  addMembers(input: AddMembersInput): Promise<ChatConversation>;
  removeMember(input: RemoveMemberInput): Promise<ChatConversation>;
  saveMessage(input: SendMessageInput): Promise<ChatMessage>;
  editMessage(input: EditMessageInput): Promise<ChatMessage>;
  deleteMessage(input: DeleteMessageInput): Promise<void>;
  listMessages(input: ListMessagesInput): Promise<ChatMessage[]>;
  markRead(input: MarkReadInput): Promise<ReadReceipt>;
}
