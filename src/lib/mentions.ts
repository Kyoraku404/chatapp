// @mention parsing + safe rendering helpers (pure, unit-tested).
// Mentions resolve to real users server-side; this module only extracts
// candidate usernames and escapes HTML so clients can never inject markup.

export function extractMentionCandidates(text: string): string[] {
  const out: string[] = [];
  const re = /(^|[\s>(])@([a-zA-Z0-9._]{1,20})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const name = m[2].replace(/[.]+$/g, "").toLowerCase();
    if (name.length >= 1 && !out.includes(name)) out.push(name);
  }
  return out;
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
