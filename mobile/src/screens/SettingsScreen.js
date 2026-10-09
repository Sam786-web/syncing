import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { createApi } from '../api';
import { colors } from '../format';

export default function SettingsScreen({ settings, onSave }) {
  const [serverUrl, setServerUrl] = useState(settings.serverUrl || 'http://192.168.1.10:4000');
  const [apiKey, setApiKey] = useState(settings.apiKey || '');
  const [status, setStatus] = useState(null); // { ok, message }
  const [testing, setTesting] = useState(false);

  const test = async () => {
    setTesting(true);
    setStatus(null);
    try {
      const api = createApi({ serverUrl, apiKey });
      await api.health();
      await api.stats(); // also verifies the API key
      setStatus({ ok: true, message: 'Connected! Server, database and API key are OK.' });
      return true;
    } catch (err) {
      setStatus({ ok: false, message: err.message });
      return false;
    } finally {
      setTesting(false);
    }
  };

  const save = async () => {
    if (await test()) onSave({ serverUrl: serverUrl.trim().replace(/\/+$/, ''), apiKey: apiKey.trim() });
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
        <Text style={styles.h1}>Connect to your server</Text>
        <Text style={styles.help}>
          Same Wi-Fi as the laptop: use the laptop's IP address, e.g. http://192.168.1.10:4000 (run "ipconfig" on the laptop
          to find the IPv4 address). If the server is deployed online, use its https:// address.
        </Text>

        <Text style={styles.label}>Server URL</Text>
        <TextInput style={styles.input} value={serverUrl} onChangeText={setServerUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" />

        <Text style={styles.label}>API key (same as API_KEY in server .env)</Text>
        <TextInput style={styles.input} value={apiKey} onChangeText={setApiKey} autoCapitalize="none" autoCorrect={false} secureTextEntry />

        {status && <Text style={[styles.status, { color: status.ok ? colors.success : colors.danger }]}>{status.message}</Text>}

        <View style={styles.row}>
          <Pressable style={[styles.btn, styles.secondary]} onPress={test} disabled={testing}>
            <Text style={styles.secondaryText}>Test</Text>
          </Pressable>
          <Pressable style={styles.btn} onPress={save} disabled={testing}>
            {testing ? <ActivityIndicator color="white" /> : <Text style={styles.btnText}>Save & connect</Text>}
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  h1: { fontSize: 22, fontWeight: '700', color: colors.text },
  help: { color: colors.muted, marginTop: 6, marginBottom: 12, lineHeight: 20 },
  label: { marginTop: 12, marginBottom: 6, color: colors.text, fontWeight: '500' },
  input: {
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: colors.text,
  },
  status: { marginTop: 14 },
  row: { flexDirection: 'row', gap: 10, marginTop: 20 },
  btn: { flex: 1, backgroundColor: colors.primary, padding: 14, borderRadius: 10, alignItems: 'center' },
  btnText: { color: 'white', fontWeight: '700' },
  secondary: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  secondaryText: { color: colors.text, fontWeight: '600' },
});
