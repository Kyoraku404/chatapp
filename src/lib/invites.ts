// Invite code generation + validity checks (pure, unit-tested).

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

export function generateInviteCode(length = 8): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

export interface InviteLike {
  expiresAt?: { seconds?: number } | number | null;
  maxUses?: number | null;
  uses: number;
  revokedAt?: unknown | null;
}

function expiryMillis(expiresAt: InviteLike["expiresAt"]): number | null {
  if (expiresAt == null) return null;
  if (typeof expiresAt === "number") return expiresAt;
  if (typeof expiresAt.seconds === "number") return expiresAt.seconds * 1000;
  return null;
}

export function inviteStatus(
  invite: InviteLike,
  now = Date.now(),
): { ok: true } | { ok: false; reason: "revoked" | "expired" | "exhausted" } {
  if (invite.revokedAt != null) return { ok: false, reason: "revoked" };
  const exp = expiryMillis(invite.expiresAt);
  if (exp != null && now > exp) return { ok: false, reason: "expired" };
  if (invite.maxUses != null && invite.uses >= invite.maxUses)
    return { ok: false, reason: "exhausted" };
  return { ok: true };
}
