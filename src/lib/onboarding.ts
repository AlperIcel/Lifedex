/**
 * Onboarding completion flag (local, AsyncStorage). Shown once; re-openable from
 * Settings. Best-effort: a storage failure just means onboarding shows again.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'lifedex.onboarded.v1';

export async function isOnboarded(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(KEY)) === '1';
  } catch {
    return false;
  }
}

export async function setOnboarded(): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, '1');
  } catch {
    // ignore
  }
}
