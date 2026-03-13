export type ChatErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INTERNAL_ERROR";

export class ChatError extends Error {
  readonly code: ChatErrorCode;
  readonly statusCode: number;
  readonly details?: unknown;

  constructor(code: ChatErrorCode, message: string, statusCode: number, details?: unknown) {
    super(message);
    this.name = "ChatError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export function isChatError(error: unknown): error is ChatError {
  return error instanceof ChatError;
}

export function normalizeToChatError(error: unknown): ChatError {
  if (isChatError(error)) {
    return error;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name: string }).name === "ZodError"
  ) {
    const issues = "issues" in error ? (error as { issues?: unknown }).issues : undefined;
    return new ChatError("VALIDATION_ERROR", "Invalid request payload", 400, issues);
  }

  const message = error instanceof Error ? error.message : "Unexpected error";
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes("unauthorized") || lowerMessage.includes("invalid token") || lowerMessage.includes("token expired")) {
    return new ChatError("UNAUTHORIZED", message, 401);
  }

  if (lowerMessage.includes("conflict") || lowerMessage.includes("already exists") || lowerMessage.includes("duplicate")) {
    return new ChatError("CONFLICT", message, 409);
  }

  if (lowerMessage.includes("not found")) {
    return new ChatError("NOT_FOUND", message, 404);
  }

  if (lowerMessage.includes("not a member") || lowerMessage.includes("only sender")) {
    return new ChatError("FORBIDDEN", message, 403);
  }

  return new ChatError("INTERNAL_ERROR", message, 500);
}
