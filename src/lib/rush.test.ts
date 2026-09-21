import { describe, expect, it } from "vitest";
import { normalizeUsername, isValidUsername, validateUsernameInput } from "./usernames";
import { dmConversationId, dmParticipants, classifyDmDoc } from "./dm";
import {
  canManageSpace, canManageChannels, canManageMembers,
  canModerateMessages, canCreateInvite, canEditMessage, canDeleteMessage,
} from "./permissions";
import { extractMentionCandidates, escapeHtml } from "./mentions";
import { hasUnread, countUnread, normalizePage } from "./unread";
import { generateInviteCode, inviteStatus } from "./invites";
import { canDirectMessage } from "./blocking";
import { blockDocId, parseBlockDocId } from "./blocking";
import {
  validateMessageContent, validateUpload, attachmentPath,
  validateDisplayName, validateBio, validateAvatarUrl,
} from "./validation";
import {
  canReadDM, canWriteDM, canReadGroup, canReadChannel, shouldCreateMembership,
} from "./authz";
import { normalizeSearchPrefix, prefixBounds } from "./search";
import { formatRelative, formatTime, toMillis } from "./live-model";

describe("usernames", () => {
  it("normalizes case + whitespace", () => {
    expect(normalizeUsername("  Ada Rush ")).toBe("ada_rush");
  });
  it("accepts valid names, rejects bad ones", () => {
    expect(isValidUsername("ada_rush")).toBe(true);
    expect(isValidUsername("ab")).toBe(false);
    expect(isValidUsername("a..b")).toBe(false);
    expect(isValidUsername("UPPER".toLowerCase())).toBe(true);
    expect(validateUsernameInput("x").ok).toBe(false);
    expect(validateUsernameInput("adarush")).toEqual({ ok: true, value: "adarush" });
  });
});

describe("DM idempotency", () => {
  it("same pair => same id regardless of order", () => {
    expect(dmConversationId("u1", "u2")).toBe(dmConversationId("u2", "u1"));
  });
  it("rejects self-DM and empty uids", () => {
    expect(() => dmConversationId("u1", "u1")).toThrow();
    expect(() => dmConversationId("", "u2")).toThrow();
  });
  it("round-trips participants", () => {
    const id = dmConversationId("u9", "u3");
    expect(dmParticipants(id)).toEqual(["u3", "u9"]);
  });
});

describe("DM backfill classification (incoming-discovery migration)", () => {
  it("leaves already-visible and clean-pending docs alone", () => {
    expect(classifyDmDoc({ hasMessages: true }, true)).toEqual({ action: "none" });
    expect(classifyDmDoc({ hasMessages: true }, false)).toEqual({ action: "none" });
    expect(
      classifyDmDoc({ hasMessages: false, lastMessageAt: null, lastMessagePreview: "", lastMessageSenderId: null }, false),
    ).toEqual({ action: "none" });
    expect(classifyDmDoc({}, false)).toEqual({ action: "none" });
  });
  it("publishes docs that have messages but are invisible", () => {
    // Legacy doc: old client touch wrote a timestamp+preview but never set
    // hasMessages → invisible to the recipient until published.
    expect(
      classifyDmDoc({ lastMessageAt: 123, lastMessagePreview: "hi", lastMessageSenderId: "a" }, true),
    ).toEqual({ action: "publish", needsTimestamp: false });
    // Timestamp missing: stamp it so orderBy(lastMessageAt) can place it.
    expect(classifyDmDoc({ hasMessages: false }, true)).toEqual({
      action: "publish",
      needsTimestamp: true,
    });
  });
  it("resets phantom metadata with no backing message to pending", () => {
    expect(
      classifyDmDoc({ lastMessageAt: 123, lastMessagePreview: "hi", lastMessageSenderId: "a" }, false),
    ).toEqual({ action: "reset-to-pending" });
    expect(classifyDmDoc({ lastMessagePreview: "hi" }, false)).toEqual({
      action: "reset-to-pending",
    });
  });
});

describe("sidebar empty states (RECENT must not masquerade errors)", () => {
  it("resolves loading/error/search/empty distinctly", async () => {
    const { resolveRiverEmptyState } = await import("./sidebar");
    expect(resolveRiverEmptyState({ loading: true, error: "x", searchActive: false, count: 0 })).toBe("loading");
    expect(resolveRiverEmptyState({ loading: false, error: "index missing", searchActive: false, count: 0 })).toBe("error");
    expect(resolveRiverEmptyState({ loading: false, error: null, searchActive: true, count: 0 })).toBe("no-search-match");
    expect(resolveRiverEmptyState({ loading: false, error: null, searchActive: false, count: 0 })).toBe("empty-inbox");
    expect(resolveRiverEmptyState({ loading: false, error: "x", searchActive: true, count: 2 })).toBe("ready");
  });
});

describe("RECENT render pipeline (mapped rows must survive empty search)", () => {
  const twoDms = [
    { id: "dm_a", kind: "dm", title: "Medai", subtitle: "hello there", unread: 1, lastAt: "now" },
    { id: "dm_b", kind: "dm", title: "Ada Rush", subtitle: "see you", unread: 0, lastAt: "5m" },
  ] as const;

  it("normalizeFilterText strips invisible chars; visible text still matches", async () => {
    const { normalizeFilterText } = await import("./sidebar");
    const zwsp = String.fromCodePoint(0x200b);
    const zwj = String.fromCodePoint(0x200d);
    expect(normalizeFilterText("")).toBe("");
    expect(normalizeFilterText("   ")).toBe("");
    expect(normalizeFilterText(zwsp)).toBe("");
    expect(normalizeFilterText(` ${zwsp}${zwj} `)).toBe("");
    expect(normalizeFilterText("Ada")).toBe("ada");
    expect(normalizeFilterText(`${zwsp}Ada${zwsp}`)).toBe("ada");
  });

  // Mirrors the real LiveApp pipeline: normalize → pre-filter rows →
  // render ConversationRiver with the filtered rows + raw filter value.
  async function renderRiver(filter: string): Promise<string> {
    const React = await import("react");
    const { renderToString } = await import("react-dom/server");
    const { ConversationRiver } = await import("@/components/chat/ConversationRiver");
    const { normalizeFilterText } = await import("./sidebar");
    const q = normalizeFilterText(filter);
    const rows = q
      ? [...twoDms].filter(
          (c) => c.title.toLowerCase().includes(q) || c.subtitle.toLowerCase().includes(q),
        )
      : [...twoDms];
    return renderToString(
      React.createElement(ConversationRiver, {
        conversations: rows as unknown as import("@/lib/demo").DemoConversation[],
        activeId: "",
        onSelect: () => undefined,
        filter,
        onFilter: () => undefined,
        loading: false,
        loadError: null,
      }),
    );
  }

  it("renders both mapped rows with an empty search (no false 'no match')", async () => {
    const html = await renderRiver("");
    expect(html).toContain("Medai");
    expect(html).toContain("Ada Rush");
    expect(html).not.toContain("No conversations match");
  });

  it("renders both rows when the box holds only invisible characters", async () => {
    const html = await renderRiver(` ${String.fromCodePoint(0x200b, 0xfeff)} `);
    expect(html).toContain("Medai");
    expect(html).toContain("Ada Rush");
    expect(html).not.toContain("No conversations match");
  });

  it("shows 'No conversations match' only for real non-matching text", async () => {
    const html = await renderRiver("zzz-no-such-user");
    expect(html).toContain("No conversations match");
    expect(html).not.toContain("Medai");
    const cleared = await renderRiver("");
    expect(cleared).toContain("Medai");
  });
});

describe("permissions", () => {
  it("role hierarchy gates management", () => {
    expect(canManageSpace("MEMBER")).toBe(false);
    expect(canManageSpace("MODERATOR")).toBe(false);
    expect(canManageSpace("ADMIN")).toBe(true);
    expect(canManageSpace("OWNER")).toBe(true);
    expect(canManageChannels("ADMIN")).toBe(true);
    expect(canManageMembers("MODERATOR")).toBe(false);
    expect(canModerateMessages("MODERATOR")).toBe(true);
    expect(canModerateMessages("MEMBER")).toBe(false);
    expect(canCreateInvite("MODERATOR")).toBe(true);
    expect(canCreateInvite(null)).toBe(false);
  });
  it("message ownership", () => {
    expect(canEditMessage("a", "a")).toBe(true);
    expect(canEditMessage("a", "b")).toBe(false);
    expect(canDeleteMessage("a", "b", false)).toBe(false);
    expect(canDeleteMessage("a", "b", true)).toBe(true);
  });
});

describe("authz (server-side)", () => {
  it("private DM readable only by participants", () => {
    expect(canReadDM("a", ["a", "b"])).toBe(true);
    expect(canReadDM("c", ["a", "b"])).toBe(false);
    expect(canWriteDM("c", ["a", "b"], false)).toBe(false);
    expect(canWriteDM("a", ["a", "b"], true)).toBe(false);
    expect(canWriteDM("a", ["a", "b"], false)).toBe(true);
  });
  it("groups/channels require membership, join is idempotent", () => {
    expect(canReadGroup("x", ["x"])).toBe(true);
    expect(canReadGroup("y", ["x"])).toBe(false);
    expect(canReadChannel("y", ["x"])).toBe(false);
    expect(shouldCreateMembership(null)).toBe(true);
    expect(shouldCreateMembership("MEMBER")).toBe(false);
  });
});

describe("mentions", () => {
  it("extracts candidates + escapes html", () => {
    expect(extractMentionCandidates("hi @Ada_Rush and @bob!")).toEqual(["ada_rush", "bob"]);
    expect(escapeHtml('<img src=x onerror=1>')).toBe("&lt;img src=x onerror=1&gt;");
  });
});

describe("unread + pagination", () => {
  it("hasUnread compares timestamps", () => {
    expect(hasUnread(2000, 1000)).toBe(true);
    expect(hasUnread(1000, 2000)).toBe(false);
    expect(hasUnread(null, 1000)).toBe(false);
    expect(hasUnread(2000, null)).toBe(true);
  });
  it("countUnread caps", () => {
    expect(countUnread([100, 200, 300], 150)).toBe(2);
    expect(countUnread([1, 2, 3, 4], null, 2)).toBe(2);
  });
  it("normalizePage clamps", () => {
    expect(normalizePage("999")).toBe(50);
    expect(normalizePage("0")).toBe(1);
    expect(normalizePage("abc")).toBe(25);
  });
});

describe("invites", () => {
  it("codes look sane + validity matrix", () => {
    expect(generateInviteCode()).toMatch(/^[A-Za-z0-9]{8}$/);
    expect(inviteStatus({ uses: 0, revokedAt: null }).ok).toBe(true);
    expect(inviteStatus({ uses: 0, revokedAt: "x" })).toEqual({ ok: false, reason: "revoked" });
    expect(inviteStatus({ uses: 5, maxUses: 5 })).toEqual({ ok: false, reason: "exhausted" });
    expect(inviteStatus({ uses: 0, expiresAt: Date.now() - 1000 })).toEqual({ ok: false, reason: "expired" });
  });
});

describe("blocking", () => {
  it("either direction blocks new DMs", () => {
    const blocks = [{ blockerId: "a", blockedId: "b" }];
    expect(canDirectMessage("b", "a", blocks)).toBe(false);
    expect(canDirectMessage("a", "b", blocks)).toBe(false);
    expect(canDirectMessage("a", "c", blocks)).toBe(true);
    expect(canDirectMessage("a", "a", [])).toBe(false);
  });
  it("block doc ids are deterministic and parse back", () => {
    expect(blockDocId("a", "b")).toBe("a_b");
    expect(parseBlockDocId("a_b")).toEqual({ blockerId: "a", blockedId: "b" });
    expect(parseBlockDocId("nope")).toBeNull();
    expect(() => blockDocId("a", "a")).toThrow();
  });
});

describe("validation + uploads", () => {
  it("message + profile bounds", () => {
    expect(validateMessageContent("")).not.toBeNull();
    expect(validateMessageContent("hi")).toBeNull();
    expect(validateDisplayName("  ")).not.toBeNull();
    expect(validateBio("x".repeat(200))).not.toBeNull();
  });
  it("upload allowlist (never extension-based)", () => {
    expect(validateUpload("image/png", 100)).toBeNull();
    expect(validateUpload("image/png", 100 * 1024 * 1024)).not.toBeNull();
    expect(validateUpload("application/x-msdownload", 100)).not.toBeNull();
    expect(attachmentPath("attachments/dm", "dm_a_b", "m1", "PNG")).toMatch(
      /^attachments\/dm\/dm_a_b\/m1_[0-9a-f]+\.png$/,
    );
  });
});

describe("avatar URL validation (free tier, no Storage)", () => {
  it("accepts https URLs, rejects dangerous protocols", () => {
    expect(validateAvatarUrl("https://example.com/you.png")).toBeNull();
    expect(validateAvatarUrl("https://cdn.example.com/a/b?q=1")).toBeNull();
    expect(validateAvatarUrl("http://localhost:3000/a.png")).toBeNull();
    expect(validateAvatarUrl("")).not.toBeNull();
    expect(validateAvatarUrl("javascript:alert(1)")).not.toBeNull();
    expect(validateAvatarUrl("data:image/png;base64,AAA")).not.toBeNull();
    expect(validateAvatarUrl("blob:https://example.com/x")).not.toBeNull();
    expect(validateAvatarUrl("http://example.com/you.png")).not.toBeNull();
    expect(validateAvatarUrl("https://example.com/a b.png")).not.toBeNull();
    expect(validateAvatarUrl("not a url")).not.toBeNull();
  });
});

describe("live-model time helpers", () => {
  const now = new Date("2026-09-21T12:00:00Z").getTime();
  it("formats relative ages", () => {
    expect(formatRelative(null, now)).toBe("");
    expect(formatRelative(now - 10_000, now)).toBe("now");
    expect(formatRelative(now - 5 * 60_000, now)).toBe("5m");
    expect(formatRelative(now - 3 * 3600_000, now)).toBe("3h");
    expect(formatRelative(now - 2 * 86400_000, now)).toBe("2d");
  });
  it("converts Firestore-like timestamps", () => {
    expect(toMillis(null)).toBeNull();
    expect(toMillis(123)).toBe(123);
    expect(toMillis({ seconds: 10 })).toBe(10_000);
    expect(toMillis({ toMillis: () => 42 })).toBe(42);
    expect(formatTime(null)).toBe("");
    expect(formatTime(now).length).toBeGreaterThan(0);
  });
});

describe("search", () => {
  it("prefix normalize + bounds", () => {
    expect(normalizeSearchPrefix("  Ada ")).toBe("ada");
    const { start, end } = prefixBounds("ada");
    expect(start).toBe("ada");
    expect(end.startsWith("ada")).toBe(true);
    expect(end.length).toBeGreaterThan(start.length);
  });
});
