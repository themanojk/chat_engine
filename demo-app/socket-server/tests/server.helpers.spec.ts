import { describe, expect, it } from "vitest";
import { ChatError } from "@littra/chat-engine-backend";
import { createDemoToken, parseBearerToken, verifyToken } from "../server.helpers";

describe("socket-server helpers", () => {
  const secret = "unit-test-secret";
  const tenantId = "tenant-demo";
  const userId = "user-a";

  it("createDemoToken + verifyToken returns expected claims", () => {
    const token = createDemoToken(userId, tenantId, secret);
    const claims = verifyToken(token, secret);

    expect(claims).toEqual({ tenantId, userId });
  });

  it("parseBearerToken returns token for valid bearer header", () => {
    expect(parseBearerToken("Bearer abc.def.ghi")).toBe("abc.def.ghi");
  });

  it("parseBearerToken returns undefined for invalid headers", () => {
    expect(parseBearerToken()).toBeUndefined();
    expect(parseBearerToken("abc.def.ghi")).toBeUndefined();
    expect(parseBearerToken("Basic token")).toBeUndefined();
  });

  it("verifyToken throws ChatError when token is missing", () => {
    expect(() => verifyToken(undefined, secret)).toThrowError(ChatError);
  });

  it("verifyToken throws ChatError when token is invalid", () => {
    expect(() => verifyToken("not-a-jwt", secret)).toThrowError();
  });
});
