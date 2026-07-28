/**
 * Thin, guarded wrapper over expo-haptics.
 *
 * Every call is fire-and-forget and swallows errors — haptics are a nicety and
 * must never crash a flow (e.g. unsupported device/emulator). Fires on the
 * RESULT COMMIT of an action, never on scroll and never twice per gesture.
 *
 * Respects the user's Settings > Gameplay > Haptics toggle (src/store/settings.ts):
 * when the user has turned haptics off, every call below becomes a true no-op.
 * Checked synchronously via settingsStore.getState() since these are plain
 * functions called from all over the app, not React components.
 */
import * as Haptics from 'expo-haptics';
import { settingsStore } from '@/store/settings';

function safe(fn: () => Promise<unknown>): void {
  if (!settingsStore.getState().hapticsEnabled) return;
  try {
    void fn();
  } catch {
    // ignore — haptics are best-effort
  }
}

export const haptics = {
  /** Selection change — chips, filters, tab presses, toggles. */
  tap(): void {
    safe(() => Haptics.selectionAsync());
  },
  /** Light impact — buttons, card taps. */
  press(): void {
    safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
  },
  /** Medium impact — camera shutter. */
  shutter(): void {
    safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
  },
  /** Success notification — card reveal, capture persisted. */
  success(): void {
    safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
  },
  /** Error notification — blocked photo, pipeline error. */
  error(): void {
    safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
  },
  /** Heavy double-tap — ONLY for epic/legendary reveals. */
  rare(): void {
    safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy));
    // second beat handled by the caller via setTimeout if desired
  },
} as const;
