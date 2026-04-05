import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is required but was not provided.");
}
const JWT_SECRET_VALUE: string = JWT_SECRET;
const JWT_EXPIRES_IN = "7d";

type AuthTokenPayload = { userId: string; email: string; role: string };

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, JWT_SECRET_VALUE, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token: string): AuthTokenPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET_VALUE);
    if (
      decoded &&
      typeof decoded === "object" &&
      "userId" in decoded &&
      "email" in decoded &&
      "role" in decoded
    ) {
      return decoded as AuthTokenPayload;
    }
    return null;
  } catch {
    return null;
  }
}
