/**
 * Thin, guarded wrapper over expo-audio — mirrors src/utils/haptics.ts.
 *
 * Every call is fire-and-forget and swallows errors — sound is a nicety and
 * must never crash a flow (e.g. a missing/broken asset or an unsupported
 * platform). Fires on the RESULT COMMIT of an action, in sync with the
 * matching haptic beat, never on scroll and never twice per gesture.
 *
 * Respects the user's Settings > Gameplay > Sound toggle (src/store/settings.ts):
 * when the user has turned sound off, every call below becomes a true no-op.
 * Checked synchronously via settingsStore.getState() since these are plain
 * functions called from all over the app, not React components.
 *
 * Players are created lazily, once per sound name, and cached for reuse —
 * each play seeks back to 0 first so rapid repeat triggers (e.g. mashing the
 * shutter) restart cleanly instead of queuing or being ignored. Creation is
 * lazy (on first play) rather than eager at import time so a native-module
 * hiccup on cold start can never break app startup — same defensive posture
 * as haptics.ts.
 *
 * NOTE: the .wav files under assets/sounds/ are currently SILENT placeholders
 * (see assets/sounds/README.md) — the wiring below is real, the audio is not,
 * yet. Real sound arrives the moment the owner swaps those files 1:1.
 */
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { settingsStore } from '@/store/settings';
import type { Rarity } from '@/domain/types';

type SoundName =
  | 'shutter'
  | 'reveal'
  | 'rarity-common'
  | 'rarity-uncommon'
  | 'rarity-rare'
  | 'rarity-epic'
  | 'rarity-legendary'
  | 'levelup'
  | 'ui-tap';

// require() needs static, literal string paths to resolve at bundle time —
// no dynamic template strings here. This map is built once, at module load.
const SOURCES: Record<SoundName, number> = {
  shutter: require('../../assets/sounds/shutter.wav'),
  reveal: require('../../assets/sounds/reveal.wav'),
  'rarity-common': require('../../assets/sounds/rarity-common.wav'),
  'rarity-uncommon': require('../../assets/sounds/rarity-uncommon.wav'),
  'rarity-rare': require('../../assets/sounds/rarity-rare.wav'),
  'rarity-epic': require('../../assets/sounds/rarity-epic.wav'),
  'rarity-legendary': require('../../assets/sounds/rarity-legendary.wav'),
  levelup: require('../../assets/sounds/levelup.wav'),
  'ui-tap': require('../../assets/sounds/ui-tap.wav'),
};

/** Maps a catch's rarity tier to its escalating stinger sound. */
const RARITY_SOUND: Record<Rarity, SoundName> = {
  common: 'rarity-common',
  uncommon: 'rarity-uncommon',
  rare: 'rarity-rare',
  epic: 'rarity-epic',
  legendary: 'rarity-legendary',
};

/** One cached AudioPlayer per sound name, created on first use. */
const players = new Map<SoundName, AudioPlayer>();

function playerFor(name: SoundName): AudioPlayer {
  let player = players.get(name);
  if (player === undefined) {
    player = createAudioPlayer(SOURCES[name]);
    players.set(name, player);
  }
  return player;
}

/** Looks up (or lazily creates) the player for `name`, rewinds it, and plays. */
function play(name: SoundName): void {
  if (!settingsStore.getState().soundEnabled) return;
  try {
    const player = playerFor(name);
    void player.seekTo(0).catch(() => {});
    player.play();
  } catch {
    // ignore — sound is best-effort
  }
}

export const sound = {
  /** Camera shutter — fires alongside haptics.shutter() on capture. */
  shutter(): void {
    play('shutter');
  },
  /**
   * Card reveal — fires alongside haptics.success()/rare() at flip
   * completion. Layers the base flip "whoosh" with the tier's escalating
   * stinger (common: small chime -> legendary: triumphant fanfare).
   */
  reveal(rarity: Rarity): void {
    play('reveal');
    play(RARITY_SOUND[rarity]);
  },
  /** Fanfare — fires when the level-up overlay appears. */
  levelUp(): void {
    play('levelup');
  },
  /** Light UI tap — chips, filters, toggles. */
  uiTap(): void {
    play('ui-tap');
  },
} as const;
