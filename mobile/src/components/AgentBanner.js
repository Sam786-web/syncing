import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../format';

/** Shows whether the laptop sync app is online and what it is uploading right now. */
export default function AgentBanner({ agents, connected }) {
  if (!connected) {
    return (
      <View style={[styles.box, styles.off]}>
        <Text style={styles.title}>⚠ Not connected to server, reconnecting…</Text>
      </View>
    );
  }
  if (!agents.length) {
    return (
      <View style={[styles.box, styles.off]}>
        <Text style={styles.title}>⚪ Laptop sync app is offline</Text>
        <Text style={styles.sub}>Files already in the cloud are still available.</Text>
      </View>
    );
  }
  return agents.map((a, i) => {
    const s = a.status || {};
    const busy = (s.uploading || 0) + (s.queued || 0);
    return (
      <View key={`${a.deviceName}-${i}`} style={[styles.box, styles.on]}>
        <Text style={styles.title}>
          🟢 {a.deviceName} · {busy ? `syncing ${busy} file${busy > 1 ? 's' : ''}` : 'up to date'}
          {s.failed ? ` · ${s.failed} failed` : ''}
        </Text>
        {(s.current || []).map((c) => (
          <View key={c.name} style={styles.progressRow}>
            <Text style={styles.sub} numberOfLines={1}>
              {c.name}
            </Text>
            <View style={styles.bar}>
              <View style={[styles.fill, { width: `${c.progress}%` }]} />
            </View>
          </View>
        ))}
      </View>
    );
  });
}

const styles = StyleSheet.create({
  box: { marginHorizontal: 16, marginTop: 10, padding: 12, borderRadius: 12, borderWidth: 1 },
  on: { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' },
  off: { backgroundColor: '#f8fafc', borderColor: colors.border },
  title: { fontWeight: '600', color: colors.text },
  sub: { color: colors.muted, fontSize: 12, marginTop: 2 },
  progressRow: { marginTop: 6 },
  bar: { height: 4, backgroundColor: '#dcfce7', borderRadius: 4, marginTop: 4, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.success },
});
