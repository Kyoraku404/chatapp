// Message + profile validation (pure, unit-tested).

export const MESSAGE_MAX_LENGTH = 4000;
export const BIO_MAX_LENGTH = 160;
export const DISPLAY_NAME_MAX_LENGTH = 40;

const ALLOWED_MESSAGE_TYPES = new Set(["TEXT", "IMAGE", "FILE", "SYSTEM"]);

export function validateMessageContent(content: string): string | null {
  if (!content || !content.trim()) return "Message cannot be empty.";
  if (content.length > MESSAGE_MAX_LENGTH)
    return `Message must be under ${MESSAGE_MAX_LENGTH} characters.`;
  return null;
}

export function validateMessageType(type: string): boolean {
  return ALLOWED_MESSAGE_TYPES.has(type);
}

export function sanitizePreview(content: string, max = 120): string {
  const flat = content.replace(/\s+/g, " ").trim();
  return flat.length > max ? flat.slice(0, max - 1) + "…" : flat;
}

export function validateDisplayName(name: string): string | null {
  const t = name.trim();
  if (!t) return "Display name cannot be empty.";
  if (t.length > DISPLAY_NAME_MAX_LENGTH) return "Display name is too long.";
  return null;
}

export function validateBio(bio: string): string | null {
  if (bio.length > BIO_MAX_LENGTH) return "Bio must be under 160 characters.";
  return null;
}

export const AVATAR_URL_MAX_LENGTH = 2048;

/**
 * Free-tier avatar validation (no Firebase Storage / no uploads).
 * Only stores a URL in Firestore; the client renders it with an
 * initials fallback. Accepts https:// URLs (plus http://localhost
 * for local dev). Rejects javascript:, data:, blob:, file:, spaces,
 * and over-long values. Never accepts base64 payloads.
 */
export function validateAvatarUrl(raw: string): string | null {
  const v = raw.trim();
  if (!v) return "Avatar URL cannot be empty.";
  if (v.length > AVATAR_URL_MAX_LENGTH) return "Avatar URL is too long.";
  if (/\s/.test(v)) return "Avatar URL must not contain spaces.";
  let parsed: URL;
  try {
    parsed = new URL(v);
  } catch {
    return "Avatar URL must be a valid URL.";
  }
  const proto = parsed.protocol.toLowerCase();
  if (proto === "https:") return null;
  if (proto === "http:") {
    const host = parsed.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host === "[::1]") return null;
    return "Avatar URL must use https:// (http is only allowed for localhost).";
  }
  return "Avatar URL must use https://.";
}

// ---- Storage upload validation (mirrors storage.rules) ----
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const FILE_TYPES = new Set<string>([...IMAGE_TYPES, "application/pdf"]);
const IMAGE_SET = new Set<string>(IMAGE_TYPES);

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_FILE_BYTES = 15 * 1024 * 1024;

export function validateUpload(
  contentType: string,
  sizeBytes: number,
): string | null {
  if (!FILE_TYPES.has(contentType)) return "File type is not allowed.";
  const max = IMAGE_SET.has(contentType) ? MAX_IMAGE_BYTES : MAX_FILE_BYTES;
  if (sizeBytes <= 0) return "File is empty.";
  if (sizeBytes > max) return "File is too large.";
  return null;
}

/** Collision-safe storage path; never trust the client filename. */
export function attachmentPath(
  scope: string,
  conversationId: string,
  messageId: string,
  ext: string,
): string {
  const safeExt = ext.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "bin";
  const rand =
    typeof crypto !== "undefined" && "getRandomValues" in crypto
      ? Array.from(crypto.getRandomValues(new Uint8Array(8)))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("")
      : Math.random().toString(16).slice(2, 18);
  return `${scope}/${conversationId}/${messageId}_${rand}.${safeExt}`;
}
