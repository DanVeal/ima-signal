import { createHash } from "node:crypto";

/** SHA-256 of the raw file bytes — used for duplicate detection, never for security. */
export function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}
