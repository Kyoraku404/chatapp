# Firebase setup (RUSH by OCN)

No secrets are in this repo. All values come from `.env.local` (see `.env.example`).

## 1. Create the project
1. Go to the Firebase Console → Add project → e.g. `rush-by-ocn`.
2. Add a Web App → copy the config into `.env.local` as `NEXT_PUBLIC_FIREBASE_*`.
3. If you want RTDB presence: Add Realtime Database → copy URL to
   `NEXT_PUBLIC_FIREBASE_DATABASE_URL`.

## 2. Authentication
- Enable **Email/Password** provider.
- (Optional, architecture-ready) Enable **Google** provider — the session-cookie
  flow accepts any Firebase ID token, so no code change is needed.
- Generate a service account key (Project settings → Service accounts →
  Firebase Admin SDK) and set:
  - `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`
  - `FIREBASE_PRIVATE_KEY` (keep `\n` newlines escaped; code unescapes them)

## 3. Firestore
- Create database (production mode).
- Deploy rules + indexes:
  `firebase deploy --only firestore:rules,firestore:indexes`
- Collections are created on first write by the app / API routes.

## 4. Realtime Database (presence only)
- Deploy `database.rules.json`: `firebase deploy --only database`.
- Durable profile stays in Firestore; `status/{uid}` in RTDB is ephemeral
  `{ state, lastChanged }`. Client uses `.info/connected` + `onDisconnect()`.

## 5. Storage
- Enable Storage, set bucket in `.env.local`.
- Deploy: `firebase deploy --only storage`.

## 6. Local development (emulators)
```
NEXT_PUBLIC_USE_EMULATORS=1
firebase emulators:start
```
Wire `connectAuthEmulator/connectFirestoreEmulator/...` in dev only
(see `src/lib/firebaseClient.ts` `useEmulators()` flag).

## 7. Required env vars (summary)
Public: API_KEY, AUTH_DOMAIN, PROJECT_ID, STORAGE_BUCKET,
MESSAGING_SENDER_ID, APP_ID, DATABASE_URL (optional), USE_EMULATORS (dev).
Server-only: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY.
