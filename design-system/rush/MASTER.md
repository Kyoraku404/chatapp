# RUSH — MASTER Design System (Source of Truth)

> Product: RUSH by OCN · real-time communication (DMs, groups, spaces/channels)
> Data sources (ui-ux-pro-max, manual reads — Python unavailable on this machine):
> products.csv → "Chat & Messaging App: Minimalism & Swiss + Micro-interactions,
> brand primary + bubble contrast"; "Social Media App: Vibrant & Block-based +
> Motion-Driven". colors.csv → Chat: Primary #2563EB / BG #FFFFFF / Accent #059669;
> Social: #E11D48 / #FFF1F2 / #2563EB. typography.csv → "Tech Startup"
> (Space Grotesk + DM Sans) for modern/bold, "Minimal Swiss" (Inter) for
> small-size readability.

## 1. Design exploration — three directions

### Direction A — "Pulse Rail" (SELECTED → refined into "Signal Flow")
- 68px icon-only presence rail (brand mark, Chats / Groups / Spaces switcher,
  avatar with presence dot) + 320px conversation river + fluid conversation pane
  + collapsible context rail.
- Unread = 2px ember "energy bar" at row edge + count chip only when >0.
- Conversation focus: grouped compact bubbles, date dividers, inline reply/edit.
- Density: desktop 3-pane; mobile view-stack with bottom tab bar.
- Verdict: strongest conversation focus, original silhouette, scales to 100+
  conversations. SELECTED.

### Direction B — "Orbit" (REJECTED)
- Spaces as orbit chips across the top, bento-card conversation grid.
- Rejected: reads as a dashboard, weak message focus, card grid wastes vertical
  rhythm for chat, poor 100-conversation scalability.

### Direction C — "Stream" (REJECTED)
- Single-column minimal Swiss, everything linear, ultra-clean.
- Rejected: no social energy, space/channel navigation buried, indistinguishable
  from a generic minimal messenger; fails "recognizably RUSH".

## 2. Brand tokens

| Token | Value | Usage |
|---|---|---|
| `--rush-*` | Ember scale, primary `rush-500 #E63A2E`, action `rush-600 #D92D20` | logo, primary actions, unread bars, selection, own-bubble |
| `--ink-*` | Ink scale, `ink-900 #131022` | text, dark surfaces, other-bubble text |
| `--paper` | `#FAF8F5` | app background (warm, not sterile) |
| presence online | `#16A34A` | presence dots, "alive" accents |
| info/links | `#2563EB` | links, info states |
| Display font | Space Grotesk | brand, nav titles, conversation titles |
| Body font | Inter | message content, metadata, composer, settings |

Rationale: Ember red is energetic/youthful/premium, distinct from OCN Learn
green, works for logo + unread + presence-adjacent selection. White text on
rush-600 ≈ 4.6:1. Body text ink-900 on paper ≈ 15:1. Secondary text
ink-500 on paper ≈ 4.6:1. No purple gradients, no gaming neon, no
glassmorphism-everywhere, no emoji nav icons (Phosphor-style inline SVG).

## 3. Type scale
- brand wordmark: Space Grotesk 700, 20px, tracking-tight
- nav section label: 11px uppercase, tracking-widest, ink-400
- conversation title: Space Grotesk 600, 16–18px
- message content: Inter 400/500, 14.5px, line-height 1.55
- metadata (time, read state): 11.5px, ink-400
- composer input: 14.5px, min-height 44px

## 4. Composition rules ("Signal Flow")
- Desktop ≥1024px: pulse rail (68px) | river (300–340px) | conversation (flex)
  | context rail (260px, collapsible, hidden <1280px by default).
- 768–1023px: rail collapses to icons; context rail becomes overlay drawer.
- <768px: view-stack — river list ⇄ conversation — plus bottom tab bar
  (Chats, Spaces, Search, You). Never shrink the 3-pane.
- Messages: own = rush-600 solid, white text, right; others = white card with
  border, left; grouped (avatar shown once per sender run); date dividers;
  `message-in` 160ms rise; `prefers-reduced-motion` disables all motion.
- Composer: rounded-2xl bar, attach + input + send; Enter=send,
  Shift+Enter=newline; optimistic pending state (opacity + "Sending"); failed =
  red tint + Retry button. Duplicate-send lock while in flight.
- Empty states: icon + one-line guidance + primary action (e.g. "Start your
  first chat"). Loading: skeleton rows (no layout jump). Errors: inline,
  human-readable, with retry.

## 5. Anti-patterns (banned)
- Discord 3-column clone, WhatsApp-Web clone, purple/blue gradients,
  neon gaming, full-glass panels, floating blobs, pills-everywhere,
  emoji-as-icon, ad-hoc hex colors (use tokens), hardcoded per-screen colors.

## 6. Accessibility contract
- Visible focus rings (rush-600 outline), semantic buttons/inputs, aria-labels
  on icon buttons, aria-live="polite" on message list + error alerts,
  contrast ≥4.5:1 body / ≥3:1 large & non-text, 44px touch targets, keyboard:
  Enter send / Esc closes dialogs / arrow navigation in river, reduced-motion
  respected, color never the sole indicator (unread has bar + count + label).

## 7. Motion
- message-in 160ms, hover 150–200ms, press feedback ≤150ms, presence pulse
  1.6s (decorative, disabled under reduced-motion). No infinite loops except
  loading spinners and the subtle presence pulse.
