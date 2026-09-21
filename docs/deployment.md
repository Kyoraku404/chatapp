# Deploy RUSH

Do NOT deploy publicly or take irreversible external actions without owner approval.

1. `npm ci && npm run typecheck && npm test && npm run build`
2. Set production env vars in the host (Vercel/Firebase Hosting):
   all `NEXT_PUBLIC_*` + `FIREBASE_*` server vars. Never bake emulators in prod.
3. `firebase deploy --only firestore:rules,firestore:indexes,storage,database`
4. Deploy the Next.js app (e.g. `vercel --prod` or Firebase App Hosting).
5. Post-deploy: create a second dev account and run the multi-user check:
   A→B DM realtime both ways, group message, space channel message.
