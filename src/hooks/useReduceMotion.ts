/**
 * useReduceMotion — reactive read of the OS-level "Reduce Motion" setting
 * (iOS: Settings > Accessibility > Motion; Android: Settings > Accessibility
 * > Remove animations).
 *
 * Unlike src/store/settings.ts (an in-app preference LifeDex owns and
 * persists), this mirrors a setting the OS itself owns — there is nothing to
 * toggle or persist here, only to observe. Screens/components read this to
 * skip or shorten decorative motion (idle floats, spins, shimmers, particle
 * fields, springs, staggered choreography) while keeping every FUNCTIONAL
 * result — capture, card reveal, level-up info, achievement text, haptics,
 * sound, dismiss — fully intact in both modes.
 *
 * Initial value is read once via `AccessibilityInfo.isReduceMotionEnabled()`.
 * That call is async, so the very first render is always `false`, flipping
 * shortly after if the OS setting is on — callers that gate a timed
 * animation should include this hook's value in their effect deps so they
 * react once the check resolves, rather than only reading it once at mount.
 * Live changes (the user toggling the setting while the app is open) are
 * picked up via the `reduceMotionChanged` event.
 *
 * Defaults to `false` and never throws, even if AccessibilityInfo is
 * unavailable or misbehaves in the current environment (e.g. a stripped-down
 * test renderer) — a broken accessibility check must never crash a screen.
 */
import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

export function useReduceMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    let subscription: { remove: () => void } | null = null;

    try {
      AccessibilityInfo.isReduceMotionEnabled()
        .then((enabled) => {
          if (mounted) setReduceMotion(enabled);
        })
        .catch(() => {
          // Unsupported platform/environment — keep the safe default (false).
        });

      subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled: boolean) => {
        setReduceMotion(enabled);
      });
    } catch {
      // A missing/broken AccessibilityInfo module must never crash the app.
    }

    return () => {
      mounted = false;
      subscription?.remove();
    };
  }, []);

  return reduceMotion;
}
