// Central Firestore / domain types for RUSH.
// Keep schema extensible; unknown future fields must not break readers.

export type PresenceState = "online" | "offline" | "idle" | "dnd";
export type SpaceVisibility = "PRIVATE" | "PUBLIC";
export type SpaceRole = "OWNER" | "ADMIN" | "MODERATOR" | "MEMBER";
export type MessageType = "TEXT" | "IMAGE" | "FILE" | "SYSTEM";
export type ConversationKind = "dm" | "group";
export type ReportTargetKind = "message" | "user" | "space";
export type NotificationKind =
  | "dm"
  | "reply"
  | "mention"
  | "group_invite"
  | "space_invite";

export interface UserProfile {
  uid: string;
  username: string; // normalized, unique
  usernameLower: string;
  displayName: string;
  avatarPath?: string | null;
  avatarUrl?: string | null;
  bio?: string;
  status?: string;
  createdAt: unknown;
  // Private fields live in users/{uid}/private/* — never on this doc.
}

export interface UsernameReservation {
  uid: string;
  createdAt: unknown;
}

export interface DMConversation {
  id: string; // deterministic dm_<a>_<b> sorted (see lib/dm.ts)
  kind: "dm";
  participants: [string, string]; // sorted uids
  createdAt: unknown;
  /** Server-authoritative activity timestamp. Null until first message. */
  lastMessageAt: unknown | null;
  /** Safe denormalized preview for the conversation list only. */
  lastMessagePreview?: string;
  lastMessageSenderId?: string | null;
  /** Explicit visibility gate: false until the first real message exists. */
  hasMessages?: boolean;
  messageCount?: number;
}

export interface GroupConversation {
  id: string;
  kind: "group";
  name: string;
  avatarPath?: string | null;
  ownerId: string;
  memberIds: string[];
  createdAt: unknown;
  lastMessageAt: unknown;
  lastMessagePreview?: string;
}

export type Conversation = DMConversation | GroupConversation;

export interface Message {
  id: string;
  conversationId: string; // or channelId for space messages (see ChannelMessage)
  senderId: string;
  content: string;
  type: MessageType;
  createdAt: unknown;
  editedAt?: unknown | null;
  deletedAt?: unknown | null;
  replyTo?: {
    messageId: string;
    senderId: string;
    preview: string;
  } | null;
  attachment?: {
    storagePath: string;
    contentType: string;
    sizeBytes: number;
    width?: number;
    height?: number;
  } | null;
  mentions?: string[]; // resolved uids
}

export interface Space {
  id: string;
  name: string;
  slug: string;
  description?: string;
  iconPath?: string | null;
  bannerPath?: string | null;
  ownerId: string;
  visibility: SpaceVisibility;
  createdAt: unknown;
}

export interface Channel {
  id: string;
  spaceId: string;
  name: string;
  topic?: string;
  sortOrder: number;
  createdAt: unknown;
}

export interface Membership {
  userId: string;
  spaceId: string;
  role: SpaceRole;
  joinedAt: unknown;
}

export interface Invite {
  code: string;
  spaceId: string;
  creatorId: string;
  createdAt: unknown;
  expiresAt?: unknown | null;
  maxUses?: number | null;
  uses: number;
  revokedAt?: unknown | null;
}

export interface ReadState {
  userId: string;
  lastReadAt: unknown;
  lastReadMessageId?: string;
}

export interface NotificationDoc {
  id: string;
  userId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  refPath?: string;
  readAt?: unknown | null;
  createdAt: unknown;
}

export interface BlockRecord {
  blockerId: string;
  blockedId: string;
  createdAt: unknown;
}

export interface Report {
  id: string;
  reporterId: string;
  targetKind: ReportTargetKind;
  targetId: string;
  reason: string;
  details?: string;
  status: "open" | "reviewing" | "resolved" | "dismissed";
  createdAt: unknown;
}
