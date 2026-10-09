import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'cloudsync.settings';

export async function loadSettings() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : { serverUrl: '', apiKey: '' };
  } catch {
    return { serverUrl: '', apiKey: '' };
  }
}

export async function saveSettings(settings) {
  await AsyncStorage.setItem(KEY, JSON.stringify(settings));
}

export const isConfigured = (s) => Boolean(s?.serverUrl && s?.apiKey);
