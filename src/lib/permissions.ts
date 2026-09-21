// Centralized permission helpers (pure, unit-tested).
// Components and API routes must call these — never inline `role === "ADMIN"`.

import type { SpaceRole } from "./types";

const RANK: Record<SpaceRole, number> = {
  MEMBER: 0,
  MODERATOR: 1,
  ADMIN: 2,
  OWNER: 3,
};

export function roleRank(role: SpaceRole | null | undefined): number {
  if (!role) return -1;
  return RANK[role] ?? -1;
}

export function canManageSpace(role: SpaceRole | null | undefined): boolean {
  return roleRank(role) >= RANK.ADMIN;
}

export function canManageChannels(role: SpaceRole | null | undefined): boolean {
  return roleRank(role) >= RANK.ADMIN;
}

export function canManageMembers(role: SpaceRole | null | undefined): boolean {
  return roleRank(role) >= RANK.ADMIN;
}

export function canModerateMessages(role: SpaceRole | null | undefined): boolean {
  return roleRank(role) >= RANK.MODERATOR;
}

export function canCreateInvite(role: SpaceRole | null | undefined): boolean {
  return roleRank(role) >= RANK.MODERATOR;
}

export function canRenameGroup(
  actorId: string,
  ownerId: string,
  memberIds: string[],
): boolean {
  if (actorId === ownerId) return true;
  return memberIds.includes(actorId) && false; // members cannot rename in V1
}

export function canEditMessage(actorId: string, senderId: string): boolean {
  return actorId === senderId;
}

export function canDeleteMessage(
  actorId: string,
  senderId: string,
  moderator: boolean,
): boolean {
  if (actorId === senderId) return true;
  return moderator;
}
