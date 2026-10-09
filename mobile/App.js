import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { io } from 'socket.io-client';
import { createApi } from './src/api';
import { isConfigured, loadSettings, saveSettings } from './src/settings';
import { colors } from './src/format';
import FilesScreen from './src/screens/FilesScreen';
import ActivityScreen from './src/screens/ActivityScreen';
import SettingsScreen from './src/screens/SettingsScreen';

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Main />
    </SafeAreaProvider>
  );
}

const TABS = [
  { key: 'files', label: 'Files' },
  { key: 'activity', label: 'Activity' },
  { key: 'settings', label: 'Settings' },
];

function Main() {
  const insets = useSafeAreaInsets();
  const [settings, setSettings] = useState(null);
  const [tab, setTab] = useState('files');
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [agents, setAgents] = useState([]);

  useEffect(() => {
    loadSettings().then((s) => {
      setSettings(s);
      if (!isConfigured(s)) setTab('settings');
    });
  }, []);

  const api = useMemo(() => (isConfigured(settings) ? createApi(settings) : null), [settings]);

  // One live connection to the server for the whole app
  useEffect(() => {
    if (!isConfigured(settings)) return;
    const s = io(settings.serverUrl, {
      auth: { apiKey: settings.apiKey, role: 'viewer' },
      transports: ['websocket'],
      reconnectionDelayMax: 10000,
    });
    s.on('connect', () => setConnected(true));
    s.on('disconnect', () => setConnected(false));
    s.on('connect_error', () => setConnected(false));
    s.on('agents', setAgents);
    setSocket(s);
    return () => {
      s.disconnect();
      setSocket(null);
      setConnected(false);
    };
  }, [settings]);

  if (!settings) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  const onSave = async (next) => {
    await saveSettings(next);
    setSettings(next);
    setTab('files');
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>☁ CloudSync</Text>
        {api && <View style={[styles.dot, { backgroundColor: connected ? colors.success : colors.danger }]} />}
      </View>

      <View style={{ flex: 1 }}>
        {tab === 'settings' || !api ? (
          <SettingsScreen settings={settings} onSave={onSave} />
        ) : tab === 'files' ? (
          <FilesScreen api={api} socket={socket} connected={connected} agents={agents} />
        ) : (
          <ActivityScreen api={api} socket={socket} />
        )}
      </View>

      <View style={[styles.tabs, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        {TABS.map((t) => (
          <Pressable key={t.key} style={styles.tab} onPress={() => api && setTab(t.key)}>
            <Text style={[styles.tabText, tab === t.key && styles.tabOn]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.card },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  title: { fontSize: 20, fontWeight: '700', color: colors.text },
  dot: { width: 10, height: 10, borderRadius: 5 },
  tabs: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 8 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 6 },
  tabText: { color: colors.muted, fontWeight: '600' },
  tabOn: { color: colors.primary },
});
