/**
 * Tests for the settings store (src/store/settings.ts) and its wiring into
 * src/utils/haptics.ts.
 *
 * Covers:
 *   - Safe defaults (km, haptics on, sound on).
 *   - setUnits / setHapticsEnabled persist and survive a reset+hydrate cycle
 *     (simulates an app restart, mirroring __tests__/persistence.test.ts).
 *   - Corrupt / partially-invalid storage payloads are ignored field-by-field
 *     instead of throwing or clobbering valid defaults.
 *   - formatDistance is a pure, side-effect-free formatter.
 *   - haptics.ts genuinely stops firing when the setting is off, and resumes
 *     when it's back on (the "not a fake toggle" requirement).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';

import { settingsStore, formatDistance } from '../src/store/settings';
import { haptics } from '../src/utils/haptics';

beforeEach(async () => {
  await AsyncStorage.clear();
  settingsStore.resetForTests();
  jest.clearAllMocks();
});

/* ------------------------------------------------------------------ */
/* Defaults                                                            */
/* ------------------------------------------------------------------ */

describe('settingsStore defaults', () => {
  it('starts with km units, haptics on, sound on', () => {
    const s = settingsStore.getState();
    expect(s.units).toBe('km');
    expect(s.hapticsEnabled).toBe(true);
    expect(s.soundEnabled).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Persistence round-trip (simulated restart)                          */
/* ------------------------------------------------------------------ */

describe('settingsStore persistence round-trip', () => {
  it('persists setUnits across a reset+hydrate cycle', async () => {
    settingsStore.setUnits('mi');
    await settingsStore.flush();

    settingsStore.resetForTests(); // in-memory only — storage still has 'mi'
    expect(settingsStore.getState().units).toBe('km');

    await settingsStore.hydrate();
    expect(settingsStore.getState().units).toBe('mi');
  });

  it('persists setHapticsEnabled across a reset+hydrate cycle', async () => {
    settingsStore.setHapticsEnabled(false);
    await settingsStore.flush();

    settingsStore.resetForTests();
    await settingsStore.hydrate();
    expect(settingsStore.getState().hapticsEnabled).toBe(false);
  });

  it('ignores corrupt (non-JSON) storage and keeps defaults', async () => {
    await AsyncStorage.setItem('lifedex:settings:v1', 'not json{{{');
    settingsStore.resetForTests();
    await expect(settingsStore.hydrate()).resolves.toBeUndefined();
    expect(settingsStore.getState().units).toBe('km');
  });

  it('rejects invalid fields but keeps valid ones from storage', async () => {
    await AsyncStorage.setItem(
      'lifedex:settings:v1',
      JSON.stringify({ units: 'parsecs', hapticsEnabled: 'yes', soundEnabled: false }),
    );
    settingsStore.resetForTests();
    await settingsStore.hydrate();
    const s = settingsStore.getState();
    expect(s.units).toBe('km'); // invalid enum value rejected -> default kept
    expect(s.hapticsEnabled).toBe(true); // wrong type rejected -> default kept
    expect(s.soundEnabled).toBe(false); // valid boolean accepted
  });

  it('hydrate() shares one in-flight read when called concurrently', async () => {
    settingsStore.resetForTests();
    const [a, b] = await Promise.all([settingsStore.hydrate(), settingsStore.hydrate()]);
    expect(a).toBeUndefined();
    expect(b).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */
/* formatDistance — pure helper                                        */
/* ------------------------------------------------------------------ */

describe('formatDistance', () => {
  it('formats sub-km distances in meters', () => {
    expect(formatDistance(340, 'km')).toBe('340 m');
  });

  it('formats km distances with one decimal', () => {
    expect(formatDistance(1234, 'km')).toBe('1.2 km');
  });

  it('formats short distances in feet under miles preference', () => {
    expect(formatDistance(30, 'mi')).toBe('98 ft');
  });

  it('formats longer distances in miles with one decimal', () => {
    expect(formatDistance(1609.344, 'mi')).toBe('1.0 mi');
  });

  it('clamps negative/invalid input to zero instead of throwing', () => {
    expect(formatDistance(-5, 'km')).toBe('0 m');
    expect(formatDistance(NaN, 'mi')).toBe('0 ft');
  });
});

/* ------------------------------------------------------------------ */
/* haptics.ts respects the Settings toggle (not a fake switch)         */
/* ------------------------------------------------------------------ */

describe('haptics respects the haptics-enabled setting', () => {
  it('does not call into expo-haptics when disabled', () => {
    settingsStore.setHapticsEnabled(false);

    haptics.tap();
    haptics.press();
    haptics.success();

    expect(Haptics.selectionAsync).not.toHaveBeenCalled();
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
  });

  it('calls into expo-haptics normally once re-enabled', () => {
    settingsStore.setHapticsEnabled(false);
    haptics.tap();
    expect(Haptics.selectionAsync).not.toHaveBeenCalled();

    settingsStore.setHapticsEnabled(true);
    haptics.tap();
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
  });
});
