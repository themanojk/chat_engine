/// <reference types="jest" />

import { ChatModule } from "../chat.module";
import { InMemoryChatAdapter } from "../../adapters/in-memory.adapter";
import { PostgresKnexAdapter } from "../../adapters/postgres.adapter";

describe("ChatModule register", () => {
  it("uses Postgres adapter by default when storage is omitted", () => {
    const runtime = ChatModule.register({
      tenantResolver: () => "tenant-a",
    });

    expect(runtime.storageAdapter).toBeInstanceOf(PostgresKnexAdapter);
  });

  it("uses in-memory adapter when requested", () => {
    const runtime = ChatModule.register({
      tenantResolver: () => "tenant-a",
      storage: { type: "in-memory" },
    });

    expect(runtime.storageAdapter).toBeInstanceOf(InMemoryChatAdapter);
  });
});
