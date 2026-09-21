// Presence architecture (RTDB for ephemeral state, Firestore for durable profile).
//
//   Firestore users/{uid}:  displayName, avatarUrl, bio … (durable)
//   RTDB      status/{uid}: { state: online|offline|idle|dnd, lastChanged: ServerValue.TIMESTAMP }
//
// Why RTDB: `.info/connected` + onDisconnect() gives reliable offline cleanup
// with a single write per transition, while Firestore heartbeats would cost
// a write per heartbeat per user. The client sets online on start and registers
// onDisconnect -> offline. Readers subscribe to status/{uid} (tiny payload).
//
// Firestore rules deny client writes to presence collections entirely;
// RTDB rules (database.rules.json) only allow a user to write their own node.

export const PRESENCE_PATH = (uid: string) => `status/${uid}`;

export type RtdbPresence = {
  state: "online" | "offline" | "idle" | "dnd";
  lastChanged: number;
};
