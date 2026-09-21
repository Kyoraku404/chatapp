// Prefix search over usernames/displayNames (honest Firestore search).
// Firestore has no full-text search. V1 uses range queries on
// usernameLower/displayNameLower with a documented limit, plus a
// SearchProvider abstraction so Algolia/Typesense/Meilisearch can be
// plugged in later without touching call sites.

export interface UserSearchHit {
  uid: string;
  username: string;
  displayName: string;
}

export interface SearchProvider {
  searchUsers(prefix: string, limit: number): Promise<UserSearchHit[]>;
}

/** Normalize a raw search prefix the same way usernames are normalized. */
export function normalizeSearchPrefix(raw: string): string {
  return raw.trim().toLowerCase().slice(0, 20);
}

/** Firestore range bounds for a prefix query on an ordered string field. */
export function prefixBounds(prefix: string): { start: string; end: string } {
  return { start: prefix, end: prefix + "\uf8ff" };
}

/** Upper bound for client-driven prefix search (cost control). */
export const USER_SEARCH_LIMIT = 10;
