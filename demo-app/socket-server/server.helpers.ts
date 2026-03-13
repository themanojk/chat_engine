import jwt from "jsonwebtoken";
import { ChatError } from "@littra/chat-engine-backend";

export type AuthClaims = { tenantId: string; userId: string };

export function createDemoToken(userId: string, tenantId: string, jwtSecret: string): string {
  return jwt.sign({ tenantId, userId }, jwtSecret, { expiresIn: "12h" });
}

export function parseBearerToken(authorization?: string): string | undefined {
  if (!authorization) {
    return undefined;
  }
  const [scheme, token] = authorization.split(" ");
  if (!scheme || !token || scheme.toLowerCase() !== "bearer") {
    return undefined;
  }
  return token;
}

export function verifyToken(rawToken: string | undefined, jwtSecret: string): AuthClaims {
  if (!rawToken) {
    throw new ChatError("UNAUTHORIZED", "Missing token", 401);
  }

  const decoded = jwt.verify(rawToken, jwtSecret) as Partial<AuthClaims>;
  if (!decoded.tenantId || !decoded.userId) {
    throw new ChatError("UNAUTHORIZED", "Invalid token claims", 401);
  }

  return {
    tenantId: decoded.tenantId,
    userId: decoded.userId,
  };
}
