/**
 * Tests for useReduceMotion — the OS-level Reduce Motion reader used across
 * ResultScreen/LevelUpOverlay/AchievementToast/CaptureScreen to gate
 * decorative motion while every functional result (capture, reveal,
 * level-up, achievement, haptics, sound, dismiss) stays identical in both
 * modes.
 */
import { AccessibilityInfo } from 'react-native';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import { useReduceMotion } from '../useReduceMotion';

describe('useReduceMotion', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('defaults to false (safe default before the async OS check resolves)', () => {
    const { result } = renderHook(() => useReduceMotion());
    expect(result.current).toBe(false);
  });

  it('flips to true once isReduceMotionEnabled resolves true', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);

    const { result } = renderHook(() => useReduceMotion());

    await waitFor(() => {
      expect(result.current).toBe(true);
    });
  });

  it('stays false when isReduceMotionEnabled resolves false', async () => {
    const spy = jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);

    const { result } = renderHook(() => useReduceMotion());

    await waitFor(() => {
      expect(spy).toHaveBeenCalled();
    });
    expect(result.current).toBe(false);
  });

  it('never throws and keeps the safe default when isReduceMotionEnabled rejects', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockRejectedValue(new Error('unsupported'));

    const { result } = renderHook(() => useReduceMotion());

    await act(async () => {
      await Promise.resolve().then(() => Promise.resolve());
    });

    expect(result.current).toBe(false);
  });

  it('never throws even if isReduceMotionEnabled throws synchronously', () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockImplementation(() => {
      throw new Error('native module unavailable');
    });

    expect(() => renderHook(() => useReduceMotion())).not.toThrow();
  });

  it('updates live via reduceMotionChanged and unsubscribes on unmount', async () => {
    // Pin the initial async check to a known value and let it settle first —
    // otherwise its resolution can land after our manual handler(true) below
    // (both are microtask-scheduled) and flip state back to false out from
    // under the assertion.
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);

    let handler: ((enabled: boolean) => void) | undefined;
    const remove = jest.fn();
    // AccessibilityInfo.addEventListener's generic signature doesn't narrow
    // cleanly through jest.spyOn's mock typing — the cast is scoped to this
    // one mock, mirroring the pattern already used for RN/native interop in
    // src/components/LevelRing.tsx.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(((_event: string, cb: any) => {
      handler = cb;
      return { remove };
    }) as any);

    const { result, unmount } = renderHook(() => useReduceMotion());

    await waitFor(() => {
      expect(result.current).toBe(false);
    });

    act(() => {
      handler?.(true);
    });
    expect(result.current).toBe(true);

    act(() => {
      handler?.(false);
    });
    expect(result.current).toBe(false);

    unmount();
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
