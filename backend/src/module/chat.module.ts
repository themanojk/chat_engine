import { MongoAdapter } from "../adapters/mongo.adapter";
import { PostgresKnexAdapter } from "../adapters/postgres.adapter";
import { InMemoryChatAdapter } from "../adapters/in-memory.adapter";
import { ChatOptions } from "../interfaces/chat-options.interface";
import { ChatStorageAdapter } from "../interfaces/chat-storage-adapter.interface";
import { ChatService } from "../services/chat.service";
import { ChatGateway } from "../gateway/chat.gateway";

export interface ChatModuleRuntime {
  options: ChatOptions;
  storageAdapter: ChatStorageAdapter;
  chatService: ChatService;
  chatGateway: ChatGateway;
}

export interface ChatAsyncOptions {
  useFactory: () => Promise<ChatOptions> | ChatOptions;
}

export class ChatModule {
  static register(options: ChatOptions): ChatModuleRuntime {
    this.validateOptions(options);

    const storageAdapter = this.resolveStorageAdapter(options);
    const chatService = new ChatService(storageAdapter);
    const chatGateway = new ChatGateway(chatService);

    return {
      options,
      storageAdapter,
      chatService,
      chatGateway,
    };
  }

  static async registerAsync(asyncOptions: ChatAsyncOptions): Promise<ChatModuleRuntime> {
    const options = await asyncOptions.useFactory();
    return this.register(options);
  }

  private static validateOptions(options: ChatOptions): void {
    if (!options || typeof options !== "object") {
      throw new Error("ChatModule.register requires a valid options object");
    }

    if (typeof options.tenantResolver !== "function") {
      throw new Error("ChatModule.register requires options.tenantResolver");
    }

  }

  private static resolveStorageAdapter(options: ChatOptions): ChatStorageAdapter {
    if (!options.storage) {
      return new PostgresKnexAdapter();
    }

    switch (options.storage.type) {
      case "postgres":
        return new PostgresKnexAdapter({
          connectionString: options.storage.connectionString,
          knexConfig: options.storage.knexConfig,
          autoCreateSchema: options.storage.autoCreateSchema,
        });
      case "mongo":
        return new MongoAdapter({
          uri: options.storage.uri,
          dbName: options.storage.dbName ?? "chat_engine",
        });
      case "in-memory":
        return new InMemoryChatAdapter();
      case "custom":
        return options.storage.adapter;
      default:
        throw new Error(`Unsupported storage type: ${(options.storage as { type?: string }).type ?? "unknown"}`);
    }
  }
}
