# RUSH architecture + cost + security notes

## Product architecture
Next.js 14 (App Router) + React 18 + TS + Tailwind. Firebase Auth (identity),
Firestore (durable state), Admin SDK (trusted writes: username reservation,
DM creation, invites, membership), Storage (media), RTDB optional (presence).

## Auth / session
Firebase client signs in (email/password; Google-ready) → ID token POSTed to
`/api/session` → Admin `createSessionCookie` → HttpOnly, SameSite=Lax cookie.
Middleware checks presence; API routes verify with `verifySessionCookie`.
Never trust browser-supplied userId.

## Firestore schema
- `users/{uid}` public profile; `users/{uid}/private/*`, `/reads/*`, `/notifications/*` owner-only
- `usernames/{lower}` reservation → uid (Admin transaction)
- `conversations/{dm_a_b}` + `messages` subcollection (DM, deterministic id)
- `groups/{id}` + `messages` subcollection
- `spaces/{id}` (+ `members/{uid}`, `channels/{ch}` (+ `messages`), `invites/{code}`)
- `blocks/{blocker_blocked}`, `reports/{id}`

## Realtime strategy
`onSnapshot(orderBy createdAt desc, limit 25)` per open conversation; older
pages via `startAfter`. No global listeners. Optimistic send with pending →
sent/failed states; listener echo replaces optimistic row by clientId.

## Unread
Per-user `users/{uid}/reads/{convId} { lastReadAt, lastReadMessageId }`.
Unread = `lastMessageAt > lastReadAt` (list dot) + count capped at 99 from a
bounded query. No per-message fan-out.

## Permissions (src/lib/permissions.ts)
OWNER > ADMIN > MODERATOR > MEMBER. canManageSpace/Channels/Members (ADMIN+),
canModerateMessages/canCreateInvite (MODERATOR+). Message edit = sender-only;
delete = sender or moderator. Server enforced via rules + Admin checks.

## Security audit (threat model)
IDOR: rules scope reads to participants/members. Privilege escalation:
membership writes Admin-only; rules deny client role writes. Forged uid:
rules use request.auth.uid; API uses verified session. Edit/delete by others:
sender check in rules + helpers. Invite abuse: maxUses/expiry/revoke +
transactional redeem. Storage exposure: type+size checks, unguessable random
paths, private scopes. XSS: escapeHtml + no dangerouslySetInnerHTML + mention
candidates escaped. Spam/uploads: validation limits; rate-limiting documented
below as pre-launch work. Secrets: .gitignore covers .env*/service keys.

### Hardening pass (2026-09-21) — issues found and fixed in-repo
1. Storage attachments were readable by any signed-in user with the path.
   Fixed: membership-gated reads/writes via cross-service rules.
2. DM conversation docs were client-creatable, bypassing API block checks.
   Fixed: `allow create: if false`; creation only via POST /api/dm/open.
3. DM message writes had no block guard. Fixed: deterministic
   `{blocker}_{blocked}` doc ids + both-direction exists() checks on create.
4. `username` was mutable on profile update, breaking the uniqueness
   invariant. Fixed: username/usernameLower immutable; displayName 1–40 and
   bio ≤160 enforced in rules.
5. Group owners could rewrite memberIds directly. Fixed: memberIds/ownerId/
   kind immutable in rules; membership via Admin SDK only.
6. Message edits could blank content or resurrect soft-deleted messages.
   Fixed: shared validMessageUpdate() guard (non-empty unless fresh delete,
   no edits after delete) used by DM/group/channel rules.
7. Space owners without a member doc were locked out of their own private
   space. Fixed: owner bypass on space read/update.
8. Public-space channel messages required membership while channels were
   public. Fixed: read parity (public OR member).
9. Any signed-in user could list a space's invite codes (bearer secrets).
   Fixed: invite reads are member-only; outsiders redeem via Admin API.
10. POST /api/dm/open accepted phantom uids. Fixed: getUser() existence
    check (404) before creating/checking anything.
11. Signup mirrored the profile with a redundant client write. Fixed:
    removed; POST /api/profile transaction is the single writer.
12. Demo fixtures rendered unconditionally and fake-acked sends. Fixed:
    gated behind `!configured || ?demo=1` with honest live-mode states;
    preview-only ack labeled as such.
13. Public profile page used prompt() for a dev uid. Fixed: replaced with a
    link into the app; messaging goes through POST /api/dm/open.
14. Mobile bottom "You" tab was a dead button. Fixed: links to /profile;
    mobile list now respects the active rail (previously always all items).

### Storage authorization decision (hardening pass)
Firebase Storage rules alone CAN express the required model via
`firestore.get()`/`exists()` cross-service lookups, so no server-mediated
download proxy was built. Private attachments are participant/member-gated in
storage.rules; paths stay unguessable as defense-in-depth. Tradeoff: each
authorized download spends Firestore reads for the lookup. If that cost ever
dominates, the documented fallback is a server-mediated download (Admin SDK
signed URL after an API membership check).

## Rate limiting / abuse (implemented vs remaining)
Implemented: validation caps (4k msg, 8/15MB uploads, pagination clamps,
invite maxUses/expiry, username shape). Remaining before large-scale launch:
per-IP account throttling (App Check + Cloud Armor / WAF), per-user msg rate
(Firestore counter + Cloud Function), upload quotas, enumeration dampening on
username checks, moderation queue UI for reports.

## Cost review
Reads: 25/page per open convo; river uses conversation/group docs (lastMessage
preview denormalized) — no N+1. Writes: 1/message + read-state per convo view.
Presence via RTDB (not Firestore) avoids heartbeat bills. Avoid: unbounded
listeners, heartbeat writes, full-history subscribes, fan-out notifications
(prefer per-user notification docs created by Function on mention/reply only).

## Accessibility / responsive / performance
See design-system/rush/MASTER.md §6–7. Breakpoints 390/768/1024/1440 verified
via responsive shell (view-stack mobile, rail collapse tablet, context drawer
desktop). Reduced-motion honored. Perf: paginated queries, small client
islands ("use client" only where interactive), next/image remote-pattern for
Storage, font-display:swap via Google Fonts import.

## Deferred (intentional)
Voice/video/screen-share/streaming, bots/marketplace, boosts/subscriptions,
crypto, AI chatbot/moderation, stories/social feed, home-grown E2EE. Extension
points: message `type` enum, channel `type` ready for VOICE, SearchProvider
abstraction, notification `kind` enum.
