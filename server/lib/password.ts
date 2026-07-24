import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt.toString("base64")}$${derived.toString("base64")}`;
}

export function verifyPassword(password: string, encoded: string): boolean {
  const [algorithm, n, r, p, salt, expected] = encoded.split("$");
  if (algorithm !== "scrypt" || !n || !r || !p || !salt || !expected) return false;
  const expectedBuffer = Buffer.from(expected, "base64");
  const actual = scryptSync(password, Buffer.from(salt, "base64"), expectedBuffer.length, {
    N: Number(n), r: Number(r), p: Number(p),
  });
  return actual.length === expectedBuffer.length && timingSafeEqual(actual, expectedBuffer);
}
