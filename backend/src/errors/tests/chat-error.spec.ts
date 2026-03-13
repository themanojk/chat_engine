/// <reference types="jest" />

import { ChatError, isChatError, normalizeToChatError } from "../chat-error";

describe("chat-error", () => {
  it("returns the same instance for ChatError", () => {
    const error = new ChatError("FORBIDDEN", "blocked", 403, { reason: "x" });
    expect(normalizeToChatError(error)).toBe(error);
    expect(isChatError(error)).toBe(true);
  });

  it("maps ZodError-like objects to VALIDATION_ERROR", () => {
    const zodLike = {
      name: "ZodError",
      issues: [{ path: ["content"], message: "Required" }],
    };

    const normalized = normalizeToChatError(zodLike);
    expect(normalized.code).toBe("VALIDATION_ERROR");
    expect(normalized.statusCode).toBe(400);
    expect(normalized.details).toEqual(zodLike.issues);
  });

  it("maps not-found message to NOT_FOUND", () => {
    const normalized = normalizeToChatError(new Error("resource not found"));
    expect(normalized.code).toBe("NOT_FOUND");
    expect(normalized.statusCode).toBe(404);
  });

  it("maps unauthorized/token errors to UNAUTHORIZED", () => {
    const normalized = normalizeToChatError(new Error("Invalid token for this request"));
    expect(normalized.code).toBe("UNAUTHORIZED");
    expect(normalized.statusCode).toBe(401);
  });

  it("maps membership/sender message to FORBIDDEN", () => {
    const normalized = normalizeToChatError(new Error("User is not a member of this conversation"));
    expect(normalized.code).toBe("FORBIDDEN");
    expect(normalized.statusCode).toBe(403);
  });

  it("maps duplicate/conflict message to CONFLICT", () => {
    const normalized = normalizeToChatError(new Error("duplicate key value violates unique constraint"));
    expect(normalized.code).toBe("CONFLICT");
    expect(normalized.statusCode).toBe(409);
  });

  it("falls back to INTERNAL_ERROR", () => {
    const normalized = normalizeToChatError(new Error("boom"));
    expect(normalized.code).toBe("INTERNAL_ERROR");
    expect(normalized.statusCode).toBe(500);
  });
});
