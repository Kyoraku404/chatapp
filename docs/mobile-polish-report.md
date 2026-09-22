# Mobile messaging polish verification

1. **Message state model before/after:** Previously DMs had no optimistic row or sender-visible receipt, and group/channel sends only showed a pending/failed row. Now each outgoing message has Sending, Sent, Failed and, for DMs, Delivered and Read.
2. **Sending:** An optimistic row appears immediately before the network request resolves. Its status comes from the pending outbox entry or a Firestore snapshot with pending writes.
3. **Sent:** The DM server transaction or client Firestore write has persisted successfully. The row remains Sent until a recipient acknowledgement arrives.
4. **Delivered:** A recipient's live DM listener calls the authenticated receipt API for messages it received. The server records `deliveredAt` on each message. There is no simulated delivery timer. Groups and channels do not show Delivered.
5. **Read:** A recipient must have the conversation open, the tab visible and focused, and the message substantially in view. The API records `readAt`; the sender's listener updates the check. Group/channel read receipts are not claimed.
6. **Optimistic deduplication:** The client allocates a Firestore document ID before sending. The API writes that ID idempotently, and the UI merges the optimistic row with its realtime echo under the same React key.
7. **Send animation:** Only the new outgoing row animates opacity and a 6px/0.97-scale entrance over 190ms.
8. **Incoming animation:** Only rows newly introduced by a live snapshot animate opacity and a 5px/0.985-scale entrance over 210ms; historical rows do not animate when opened.
9. **Status transition:** The status icon changes with a 150ms opacity/scale transition.
10. **Failure/retry:** Failed messages remain in the outbox with Retry. Retrying reuses the original ID, avoiding duplicate messages and unread increments. A real failed request and recovery were tested in the browser.
11. **Auto-scroll/new messages:** The list follows messages only when already near the bottom. Otherwise it holds the reader's position and shows a New messages button; this was tested with a 30-message live burst.
12. **Mobile bottom navigation:** Lucide MessageCircle, UsersRound, Layers, and CircleUser icons pair with Chats, Groups, Spaces, and You. The active section uses theme accent and a subtle background.
13. **Safe area/keyboard:** The bar uses `safe-area-inset-bottom`; the shell tracks `visualViewport`, and focused composer input hides the bar when the viewport shrinks. Desktop browser resizing was checked; a physical phone keyboard was not tested.
14. **Theme integration:** Ember, Carbon Green, Carbon Pink, and Dark Samurai were inspected at mobile width. Nav, message, and receipt colors use theme tokens.
15. **Reduced motion:** The added CSS animations and transitions are disabled under `prefers-reduced-motion: reduce`; state changes remain visible.
16. **Verification:** 84 Vitest tests pass; TypeScript, ESLint, and Next production build pass. Rendered layouts were inspected at 390px, 430px, 768px, the two sides of the 1024px breakpoint, and 1440px.
17. **Real two-account test:** Yes. Two dedicated Firebase test accounts exchanged bursts in both directions. The test verified realtime delivery/read acknowledgements, ordering, no duplicate IDs after retry, and unread clearing. A recipient also opened a DM in the browser, causing a persisted read receipt. The accounts were not used to test a live audio media path.
