import { describe, expect, it } from "vitest";
import {
  UNREAD_DISPLAY_CAP,
  formatUnreadCount,
  nextUnreadOnOpen,
  nextUnreadOnSend,
  normalizeUnreadCount,
  totalUnreadCounts,
} from "./unread";
import { readsDocPath } from "./readState";

describe("unread badge display (1–9 exact, 10+ → 9+, 0 hidden)", () => {
  it("hides the badge at zero", () => {
    expect(formatUnreadCount(0)).toBeNull();
    expect(formatUnreadCount(null)).toBeNull();
    expect(formatUnreadCount(undefined)).toBeNull();
    expect(formatUnreadCount(-4)).toBeNull();
    expect(formatUnreadCount(Number.NaN)).toBeNull();
  });
  it("renders 1–9 exactly", () => {
    for (let n = 1; n <= 9; n++) expect(formatUnreadCount(n)).toBe(String(n));
  });
  it("caps 10+ at 9+", () => {
    expect(UNREAD_DISPLAY_CAP).toBe(9);
    expect(formatUnreadCount(9)).toBe("9");
    expect(formatUnreadCount(10)).toBe("9+");
    expect(formatUnreadCount(12)).toBe("9+");
    expect(formatUnreadCount(99)).toBe("9+");
    expect(formatUnreadCount(1000)).toBe("9+");
  });
});

describe("legacy conversations (pre-counter docs show nothing fake)", () => {
  it("missing/corrupt counts normalize to 0", () => {
    expect(normalizeUnreadCount(undefined)).toBe(0);
    expect(normalizeUnreadCount(null)).toBe(0);
    expect(normalizeUnreadCount("garbage")).toBe(0);
    expect(normalizeUnreadCount(-2)).toBe(0);
    expect(normalizeUnreadCount(Number.NaN)).toBe(0);
    expect(normalizeUnreadCount({})).toBe(0);
  });
  it("floors fractional values", () => {
    expect(normalizeUnreadCount(2.9)).toBe(2);
  });
});

describe("first + multiple unread messages", () => {
  it("first incoming message → 1", () => {
    expect(nextUnreadOnSend(0, "userA", "userB")).toBe(1);
  });
  it("three rapid messages → 3 (no refresh, pure accumulation)", () => {
    let n: unknown = 0;
    n = nextUnreadOnSend(n, "userA", "userB");
    n = nextUnreadOnSend(n, "userA", "userB");
    n = nextUnreadOnSend(n, "userA", "userB");
    expect(n).toBe(3);
  });
});

describe("sender never gains unread from own messages", () => {
  it("own send leaves the count untouched", () => {
    expect(nextUnreadOnSend(0, "userB", "userB")).toBe(0);
    expect(nextUnreadOnSend(2, "userB", "userB")).toBe(2);
  });
  it("own reply after receiving keeps others' unread only", () => {
    // B has 3 unread from A, then B replies: B's count must stay 3
    // (it clears only when B OPENS/reads, via nextUnreadOnOpen).
    expect(nextUnreadOnSend(3, "userB", "userB")).toBe(3);
  });
});

describe("opening a conversation clears unread", () => {
  it("open always resets to 0", () => {
    expect(nextUnreadOnOpen()).toBe(0);
  });
  it("realtime sequence: 1 → 3 → open → 0", () => {
    let n: unknown = 0;
    n = nextUnreadOnSend(n, "userA", "userB"); // badge 1, no refresh
    expect(formatUnreadCount(n)).toBe("1");
    n = nextUnreadOnSend(n, "userA", "userB");
    n = nextUnreadOnSend(n, "userA", "userB"); // badge 3
    expect(formatUnreadCount(n)).toBe("3");
    n = nextUnreadOnOpen(); // B opens → badge disappears
    expect(n).toBe(0);
    expect(formatUnreadCount(n)).toBeNull();
  });
});

describe("global unread total (sum of messages, not conversations)", () => {
  it("sums across conversations: 3 + 1 + 2 = 6", () => {
    expect(totalUnreadCounts([3, 1, 2])).toBe(6);
    expect(formatUnreadCount(totalUnreadCounts([3, 1, 2]))).toBe("6");
  });
  it("opening one conversation decrements the global total", () => {
    const counts = new Map([
      ["naru", 3],
      ["quenne", nextUnreadOnOpen()], // opened → cleared
      ["y4mi", 2],
    ]);
    expect(totalUnreadCounts(counts.values())).toBe(5);
  });
  it("global total is 0 (hidden) when nothing is unread", () => {
    expect(totalUnreadCounts([0, 0, 0])).toBe(0);
    expect(formatUnreadCount(totalUnreadCounts([0, 0]))).toBeNull();
  });
  it("global total caps at 9+ for display but keeps the raw sum", () => {
    expect(totalUnreadCounts([9, 9])).toBe(18);
    expect(formatUnreadCount(18)).toBe("9+");
  });
  it("ignores legacy/corrupt entries in the sum", () => {
    expect(totalUnreadCounts([3, undefined, null, -1, 2])).toBe(5);
  });
});

describe("read-state scoping (unauthorized mutation impossible by construction)", () => {
  it("paths are strictly owner-scoped", () => {
    expect(readsDocPath("uidA", "dm_x_y")).toBe("users/uidA/reads/dm_x_y");
    expect(readsDocPath("uidA", "dm_x_y")).not.toBe(readsDocPath("uidB", "dm_x_y"));
  });
  it("rejects path traversal / empty refs", () => {
    expect(() => readsDocPath("", "dm_x_y")).toThrow();
    expect(() => readsDocPath("uidA", "")).toThrow();
    expect(() => readsDocPath("uidA", "../other")).toThrow();
    expect(() => readsDocPath("uidA", "..")).toThrow();
    expect(() => readsDocPath("uidA", "a/b")).toThrow();
  });
  it("firestore.rules keeps reads owner-only (tripwire)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const rules = fs.readFileSync(path.join(process.cwd(), "firestore.rules"), "utf8");
    const at = rules.indexOf("match /reads/{convId}");
    expect(at).toBeGreaterThan(-1);
    const block = rules.slice(at, at + 400);
    // Owner-only read AND write; no cross-user access.
    expect(block).toContain("uid() == userId");
    expect(block).not.toContain("allow create");
  });
});
