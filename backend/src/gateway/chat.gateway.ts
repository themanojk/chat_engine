import { ChatService } from "../services/chat.service";

export class ChatGateway {
  constructor(private readonly chatService: ChatService) {}

  get service(): ChatService {
    return this.chatService;
  }
}
