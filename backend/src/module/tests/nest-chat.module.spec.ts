/// <reference types="jest" />

import { ChatGateway } from "../../gateway/chat.gateway";
import { ChatService } from "../../services/chat.service";
import { CHAT_OPTIONS, CHAT_STORAGE_ADAPTER, NestChatModule } from "../nest-chat.module";

describe("NestChatModule", () => {
  it("register returns dynamic module with expected providers/exports", () => {
    const dynamicModule = NestChatModule.register({
      tenantResolver: () => "tenant-a",
      storage: { type: "in-memory" },
    });

    expect(dynamicModule.module).toBe(NestChatModule);
    expect(dynamicModule.providers).toBeDefined();
    expect(dynamicModule.exports).toEqual(
      expect.arrayContaining([CHAT_OPTIONS, CHAT_STORAGE_ADAPTER, ChatService, ChatGateway]),
    );
  });

  it("registerAsync builds providers that resolve options and storage adapter", async () => {
    const dependencyToken = Symbol("DEP");
    const dynamicModule = NestChatModule.registerAsync({
      imports: [class TestImportModule {}],
      inject: [dependencyToken],
      useFactory: async () => ({
        tenantResolver: () => "tenant-a",
        storage: { type: "in-memory" as const },
      }),
    });

    expect(dynamicModule.module).toBe(NestChatModule);
    expect(dynamicModule.providers).toBeDefined();

    const providers = dynamicModule.providers as Array<{ provide: unknown; useFactory?: (...args: unknown[]) => unknown }>;

    const optionsProvider = providers.find((provider) => provider.provide === CHAT_OPTIONS);
    const storageProvider = providers.find((provider) => provider.provide === CHAT_STORAGE_ADAPTER);

    expect(optionsProvider?.useFactory).toBeDefined();
    expect((optionsProvider as { inject?: unknown[] }).inject).toEqual([dependencyToken]);
    expect(storageProvider?.useFactory).toBeDefined();
    expect(dynamicModule.imports).toBeDefined();

    const options = await (optionsProvider?.useFactory as () => Promise<unknown>)();
    const storageAdapter = await (storageProvider?.useFactory as (optionsArg: unknown) => Promise<unknown>)(options);

    expect(storageAdapter).toBeDefined();
  });

  it("registerAsync storage factory throws when options are invalid", async () => {
    const dynamicModule = NestChatModule.registerAsync({
      useFactory: () => ({ storage: { type: "in-memory" as const } } as any),
    });

    const providers = dynamicModule.providers as Array<{ provide: unknown; useFactory?: (...args: unknown[]) => unknown }>;
    const storageProvider = providers.find((provider) => provider.provide === CHAT_STORAGE_ADAPTER);

    await expect((storageProvider?.useFactory as (optionsArg: unknown) => Promise<unknown>)({ storage: { type: "in-memory" } }))
      .rejects
      .toThrow("ChatModule.register requires options.tenantResolver");
  });
});
