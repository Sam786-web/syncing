import { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { colors, timeAgo } from '../format';

const EVENT_STYLE = {
  uploaded: { icon: '⬆', label: 'Uploaded', color: colors.success },
  duplicate_skipped: { icon: '≡', label: 'Duplicate skipped', color: colors.muted },
  upload_failed: { icon: '✖', label: 'Upload failed', color: colors.danger },
  deleted: { icon: '🗑', label: 'Deleted', color: colors.danger },
  folder_added: { icon: '📁', label: 'Folder added', color: colors.primary },
  folder_removed: { icon: '📁', label: 'Folder removed', color: colors.muted },
};

export default function ActivityScreen({ api, socket }) {
  const [events, setEvents] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setEvents((await api.events(100)).events);
    } catch (err) {
      setError(err.message);
    }
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!socket) return;
    const onEvent = (e) => setEvents((prev) => [e, ...prev].slice(0, 200));
    socket.on('event:new', onEvent);
    return () => socket.off('event:new', onEvent);
  }, [socket]);

  return (
    <FlatList
      style={{ backgroundColor: colors.bg }}
      data={events}
      keyExtractor={(e) => String(e.id)}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      ListHeaderComponent={error ? <Text style={styles.error}>{error}</Text> : null}
      ListEmptyComponent={<Text style={styles.empty}>No activity yet.</Text>}
      renderItem={({ item }) => {
        const s = EVENT_STYLE[item.event_type] || { icon: '•', label: item.event_type, color: colors.muted };
        return (
          <View style={styles.row}>
            <Text style={[styles.icon, { color: s.color }]}>{s.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.label, { color: s.color }]}>{s.label}</Text>
              {item.message ? <Text style={styles.msg} numberOfLines={2}>{item.message}</Text> : null}
              <Text style={styles.meta}>
                {timeAgo(item.created_at)}
                {item.device_name ? ` · ${item.device_name}` : ''}
              </Text>
            </View>
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row', gap: 12, padding: 14, backgroundColor: colors.card,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  icon: { fontSize: 18, width: 24, textAlign: 'center' },
  label: { fontWeight: '600', fontSize: 13 },
  msg: { color: colors.text, marginTop: 2 },
  meta: { color: colors.muted, fontSize: 12, marginTop: 2 },
  empty: { textAlign: 'center', color: colors.muted, marginTop: 40 },
  error: { color: colors.danger, padding: 16 },
});
