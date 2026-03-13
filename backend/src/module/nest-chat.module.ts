import { DynamicModule, Module, Provider } from "@nestjs/common";
import { FactoryProvider, ModuleMetadata } from "@nestjs/common/interfaces";
import { ChatGateway } from "../gateway/chat.gateway";
import { ChatOptions } from "../interfaces/chat-options.interface";
import { ChatStorageAdapter } from "../interfaces/chat-storage-adapter.interface";
import { ChatModule } from "./chat.module";
import { ChatService } from "../services/chat.service";

export const CHAT_OPTIONS = Symbol("CHAT_OPTIONS");
export const CHAT_STORAGE_ADAPTER = Symbol("CHAT_STORAGE_ADAPTER");

export interface NestChatAsyncOptions {
  imports?: ModuleMetadata["imports"];
  inject?: FactoryProvider["inject"];
  useFactory: (...args: unknown[]) => Promise<ChatOptions> | ChatOptions;
}

@Module({})
export class NestChatModule {
  static register(options: ChatOptions): DynamicModule {
    const runtime = ChatModule.register(options);

    const providers: Provider[] = [
      { provide: CHAT_OPTIONS, useValue: runtime.options },
      { provide: CHAT_STORAGE_ADAPTER, useValue: runtime.storageAdapter },
      { provide: ChatService, useValue: runtime.chatService },
      { provide: ChatGateway, useValue: runtime.chatGateway },
    ];

    return {
      module: NestChatModule,
      providers,
      exports: [CHAT_OPTIONS, CHAT_STORAGE_ADAPTER, ChatService, ChatGateway],
    };
  }

  static registerAsync(asyncOptions: NestChatAsyncOptions): DynamicModule {
    const optionsProvider: Provider = {
      provide: CHAT_OPTIONS,
      useFactory: asyncOptions.useFactory,
      inject: asyncOptions.inject ?? [],
    };

    const storageProvider: Provider = {
      provide: CHAT_STORAGE_ADAPTER,
      useFactory: async (options: ChatOptions): Promise<ChatStorageAdapter> => {
        const runtime = await ChatModule.registerAsync({
          useFactory: () => options,
        });
        return runtime.storageAdapter;
      },
      inject: [CHAT_OPTIONS],
    };

    const serviceProvider: Provider = {
      provide: ChatService,
      useFactory: (storage: ChatStorageAdapter) => new ChatService(storage),
      inject: [CHAT_STORAGE_ADAPTER],
    };

    const gatewayProvider: Provider = {
      provide: ChatGateway,
      useFactory: (service: ChatService) => new ChatGateway(service),
      inject: [ChatService],
    };

    return {
      module: NestChatModule,
      imports: asyncOptions.imports ?? [],
      providers: [optionsProvider, storageProvider, serviceProvider, gatewayProvider],
      exports: [CHAT_OPTIONS, CHAT_STORAGE_ADAPTER, ChatService, ChatGateway],
    };
  }
}
