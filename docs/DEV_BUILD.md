# Development Build — leaving Expo Go (owner guide)

Expo Go can only run the latest SDK and can't hide the nav bar, show a real map,
do native sign-in, or be distributed. A **development build** is your own copy of
the app (with all native modules) that you install once and then drive with the
Metro dev server — same fast-refresh workflow as Expo Go, but real.

`eas.json` (build profiles) is already committed. You only need the accounts +
keys below, then one command.

---

## What you (the owner) need
1. **Expo account** — free. Sign up at https://expo.dev (this drives EAS cloud builds).
2. **Google Play Developer account** — one-time **US$25**, at
   https://play.google.com/console (only needed to *publish*; not for testing on
   your own phone). Sign up early — see the 14-day note at the bottom.
3. **Google Maps API key** — free tier, only needed for the real map (Phase 3),
   NOT for the first build. https://console.cloud.google.com → new project →
   enable **"Maps SDK for Android"** → Credentials → create API key.

You never paste keys to me. Put them in `.env` (gitignored) yourself.

---

## First development build (Android)
Run these on your machine, in the project folder:

```bash
npm install -g eas-cli
eas login
eas build --profile development --platform android
```

- The first run links the project (creates it under your Expo account, writes an
  `eas.projectId`) and generates an Android keystore for you — just accept the
  prompts.
- The build runs in Expo's cloud (~10–20 min). When done, the terminal shows a
  URL / QR to **download the APK** onto your phone. Install it (allow "install
  from unknown sources" once).

Then start the dev server and open the app (not Expo Go — the new LifeDex icon):

```bash
npx expo start --dev-client -c
```

The dev build connects to Metro just like Expo Go did. From here, **immersive
nav bar and all native modules work**.

---

## When you want the real map (Phase 3)
1. Get the Google Maps key (above), then in `.env`:
   ```bash
   GOOGLE_MAPS_API_KEY=your_key_here
   MAPS_PROVIDER=google
   ```
2. Rebuild the dev client (native config changed):
   `eas build --profile development --platform android`.
   (Map wiring in the app is a code step I'll do — this just makes the key available.)

---

## Share a testable build (no dev server needed)
A **preview** build is a standalone APK friends can install directly:

```bash
eas build --profile preview --platform android
```

## Publish to Google Play (later)
```bash
eas build --profile production --platform android   # builds an .aab
eas submit --profile production --platform android   # uploads to Play
```

> **Start Play testing EARLY.** New personal Play developer accounts must run a
> **Closed Test with ~12 testers for 14 days** before you can go to Production.
> That 14-day clock is the single longest item on the path to launch — kick off
> Closed Testing as soon as the first production build exists, not at the end.

---

## iOS (later / optional)
Same flow with `--platform ios`, but needs an Apple Developer account
(US$99/year) and is built from EAS cloud (no Mac required). Android-first is the
plan; iOS is a fast-follow.
