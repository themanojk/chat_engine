/// <reference types="jest" />

import { ChatGateway } from "../chat.gateway";
import { ChatService } from "../../services/chat.service";
import { InMemoryChatAdapter } from "../../adapters/in-memory.adapter";

describe("ChatGateway", () => {
  it("exposes the injected ChatService instance", () => {
    const service = new ChatService(new InMemoryChatAdapter());
    const gateway = new ChatGateway(service);

    expect(gateway.service).toBe(service);
  });
});
