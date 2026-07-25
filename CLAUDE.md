# LifeDex — agent instructions

**On session start: read `STATUS.md` first.** It is the living single source of
truth for what this project is, where we stand, and what's next. `NEXT_STEPS.md`
is the deeper backlog; `docs/OWNER_SETUP.md` lists owner (Supabase/keys) steps.

**Keep `STATUS.md` current.** Whenever you finish something meaningful (a feature,
a fix, a state change), update `STATUS.md` (the state table, "recently done",
"next up", and the "last updated" date) as part of the same work — so the next
session always knows where we are.

## Guardrails
- **Verify every change** with `npx tsc --noEmit`, `npx jest`, and (for anything
  that could affect bundling) `npx expo export`. Keep all three green. Commit per
  logical unit with a clear message.
- **Design tokens only** — no raw hex outside `src/theme/theme.ts`. Ionicons in
  chrome; emoji only inside mock card placeholders. RN `Animated` +
  `useNativeDriver` (no reanimated).
- **Privacy invariants (hard):** never render `privatePhotoUri`; never upload the
  full original photo, a `file://` path, or exact GPS to Supabase; protected /
  hidden species must never expose coordinates.
- **Mock-first:** the app must always run with NO API keys (mock providers). Real
  providers are env-gated and guarded; Supabase calls no-op when not configured.

## Delegating to subagents (learned the hard way)
- In any subagent prompt, state explicitly: **"Do the work yourself; you are
  FORBIDDEN to spawn subagents or wait."** (They otherwise recurse into
  spawn-and-wait loops and do nothing.)
- **Never run two agents on the same file** concurrently — it corrupts the file.
  Parallelize only across disjoint files; serialize anything touching shared files
  (store, theme, navigation, components). Verify the combined result yourself.
