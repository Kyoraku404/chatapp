// DEVELOPMENT-ONLY fixtures. Clearly labeled, never shipped as real usage.
// The app shell renders these when Firebase is unconfigured or when
// ?demo=1 is set, so the design can be validated without a backend.

import type { PresenceState } from "./types";

export const IS_DEMO_SOURCE = true;

export interface DemoConversation {
  id: string;
  kind: "dm" | "group" | "channel";
  /** Display name (user displayName / group name). Never a message preview. */
  title: string;
  /** List preview (lastMessagePreview). Only rendered in the sidebar list. */
  subtitle: string;
  unread: number;
  presence?: PresenceState;
  space?: string;
  lastAt: string;
  // Live-only extensions (never set by preview fixtures). Live Firestore
  // data maps into this same UI shape so components stay identical.
  /** Firestore backing ref for live conversations. */
  ref?: { scope: "dm" | "group"; id: string; otherUid?: string };
  /** Hide the count badge; show the unread bar only (exact counts cost reads). */
  hideCount?: boolean;
  /** Identity fields for the DM header (never derived from messages). */
  username?: string;
  avatarUrl?: string | null;
  status?: string | null;
}

export interface DemoMessage {
  status?: import('./message-lifecycle').MessageStatus;
  createdAtMs?: number;
  entrance?: 'outgoing' | 'incoming';
  id: string;
  sender: string;
  own: boolean;
  content: string;
  at: string;
  replyTo?: { sender: string; preview: string };
  edited?: boolean;
  failed?: boolean;
  pending?: boolean;
  // Live-only extensions (never set by preview fixtures).
  /** Sender uid. */
  senderId?: string;
  senderUsername?: string;
  /** Sender avatar URL for message grouping headers (initials fallback). */
  senderAvatarUrl?: string | null;
  /** Resolved attachment download URL (IMAGE/FILE messages). */
  attachmentUrl?: string | null;
  /** MIME type of the attachment, if any. */
  attachmentType?: string | null;
  /** Soft-deleted messages render as a tombstone. */
  deleted?: boolean;
}

export const DEMO_CONVERSATIONS: DemoConversation[] = [
  { id: "c-maya", kind: "dm", title: "Maya Chen", subtitle: "Sending the launch checklist now", unread: 3, presence: "online", lastAt: "2m" },
  { id: "c-crew", kind: "group", title: "Design crew", subtitle: "Theo: ember > everything", unread: 12, presence: "online", lastAt: "9m" },
  { id: "c-ocn-general", kind: "channel", title: "# general", subtitle: "Priya: welcome to OCN Developers!", unread: 5, space: "OCN Developers", lastAt: "26m" },
  { id: "c-jonas", kind: "dm", title: "Jonas Peters", subtitle: "You: sounds good, ship it", unread: 0, presence: "idle", lastAt: "1h" },
  { id: "c-ocn-help", kind: "channel", title: "# help", subtitle: "Solved: presence via RTDB", unread: 0, space: "OCN Developers", lastAt: "3h" },
  { id: "c-uni", kind: "group", title: "Uni friends", subtitle: "Lena: friday still on?", unread: 0, presence: "offline", lastAt: "1d" },
];

export const DEMO_MESSAGES: Record<string, DemoMessage[]> = {
  "c-crew": [
    { id: "m1", sender: "Priya Nair", own: false, content: "Final call on the brand color — ember 🔥 or keep exploring?", at: "09:41" },
    { id: "m2", sender: "Theo Marsh", own: false, content: "Ember. It has energy without screaming. Ship it.", at: "09:44", replyTo: { sender: "Priya Nair", preview: "Final call on the brand color…" } },
    { id: "m3", sender: "You", own: true, content: "Locked. Signal Flow layout + ember + Space Grotesk. Building the shell now.", at: "09:47" },
    { id: "m4", sender: "Maya Chen", own: false, content: "Presence dots pulsing in the rail already. This feels alive.", at: "09:52" },
    { id: "m5", sender: "You", own: true, content: "Uploading the checklist…", at: "09:53", pending: true },
  ],
  "c-maya": [
    { id: "m1", sender: "Maya Chen", own: false, content: "Did you see the new channel layout?", at: "10:02" },
    { id: "m2", sender: "Maya Chen", own: false, content: "The river + energy bars read so much faster than badges everywhere.", at: "10:03" },
    { id: "m3", sender: "Maya Chen", own: false, content: "Sending the launch checklist now — check the group too.", at: "10:03" },
  ],
  "c-ocn-general": [
    { id: "m1", sender: "RUSH Bot", own: false, content: "Welcome to OCN Developers! Say hi in # off-topic.", at: "08:00" },
    { id: "m2", sender: "Priya Nair", own: false, content: "Welcome everyone — introduce yourself with your stack + timezone.", at: "08:15" },
  ],
};

export function demoMessagesFor(id: string): DemoMessage[] {
  return DEMO_MESSAGES[id] ?? [
    { id: "m-empty-1", sender: "RUSH", own: false, content: "No messages yet. Say hi — the first message is the hardest.", at: "" },
  ];
}
