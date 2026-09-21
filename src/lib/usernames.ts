// Username normalization + validation (pure, unit-tested).
// Rules: 3–20 chars, lowercase letters/digits/underscore/dot, must start
// with letter/digit, no consecutive dots, no trailing dot.

const USERNAME_RE = /^(?=.{3,20}$)[a-z0-9](?:[a-z0-9._]*[a-z0-9_])?$/;

export function normalizeUsername(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, "_");
}

export function isValidUsername(normalized: string): boolean {
  if (!USERNAME_RE.test(normalized)) return false;
  if (normalized.includes("..")) return false;
  return true;
}

export function validateUsernameInput(
  input: string,
): { ok: true; value: string } | { ok: false; error: string } {
  const value = normalizeUsername(input);
  if (value.length < 3) return { ok: false, error: "Username must be at least 3 characters." };
  if (value.length > 20) return { ok: false, error: "Username must be at most 20 characters." };
  if (!isValidUsername(value))
    return {
      ok: false,
      error: "Use lowercase letters, numbers, dots or underscores.",
    };
  return { ok: true, value };
}
