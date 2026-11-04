// Small JSON wrapper around AsyncStorage (localStorage on web, native storage on iOS/Android).
import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = 'spacelings:';

export async function load<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export async function save(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Storage full or unavailable: the app keeps working from memory.
  }
}

export async function remove(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(PREFIX + key);
  } catch {}
}

export async function clearAll(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    await AsyncStorage.multiRemove(keys.filter((k) => k.startsWith(PREFIX)));
  } catch {}
}
