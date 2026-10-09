import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import AgentBanner from '../components/AgentBanner';
import FileRow from '../components/FileRow';
import FileDetail from '../components/FileDetail';
import { CATEGORIES, colors, formatSize } from '../format';

const PAGE = 30;

export default function FilesScreen({ api, socket, connected, agents }) {
  const [files, setFiles] = useState([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState(null);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [newIds, setNewIds] = useState(() => new Set());
  const [upload, setUpload] = useState(null); // { name, progress }

  const filtersRef = useRef({ query, category });
  filtersRef.current = { query, category };
  const filesRef = useRef(files);
  filesRef.current = files;

  const removeFile = useCallback((id) => {
    if (!filesRef.current.some((f) => f.id === id)) return;
    filesRef.current = filesRef.current.filter((f) => f.id !== id);
    setFiles(filesRef.current);
    setTotal((t) => Math.max(0, t - 1));
  }, []);

  // debounce search typing
  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  const loadStats = useCallback(() => api.stats().then(setStats).catch(() => {}), [api]);

  const load = useCallback(
    async (mode = 'reset') => {
      try {
        setError(null);
        const offset = mode === 'more' ? files.length : 0;
        const res = await api.listFiles({ search: query, category, limit: PAGE, offset });
        setFiles((prev) => (mode === 'more' ? [...prev, ...res.items.filter((f) => !prev.some((p) => p.id === f.id))] : res.items));
        setTotal(res.total);
      } catch (err) {
        setError(err.message);
      }
    },
    [api, query, category, files.length]
  );

  // reload whenever filters change
  useEffect(() => {
    setLoading(true);
    Promise.all([load('reset'), loadStats()]).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, query, category]);

  // ---- live updates from the laptop ----
  useEffect(() => {
    if (!socket) return;
    const onCreated = (file) => {
      const { query: q, category: c } = filtersRef.current;
      const matches =
        (c === 'all' || file.category === c) &&
        (!q || file.relativePath.toLowerCase().includes(q.toLowerCase()));
      if (matches) {
        setFiles((prev) => (prev.some((f) => f.id === file.id) ? prev : [file, ...prev]));
        setTotal((t) => t + 1);
        setNewIds((prev) => new Set(prev).add(file.id));
        setTimeout(() => setNewIds((prev) => {
          const next = new Set(prev);
          next.delete(file.id);
          return next;
        }), 8000);
      }
      loadStats();
    };
    const onDeleted = ({ id }) => {
      removeFile(id);
      setSelected((s) => (s?.id === id ? null : s));
      loadStats();
    };
    // after a reconnect we may have missed events, so refresh
    const onReconnect = () => {
      load('reset');
      loadStats();
    };
    socket.on('file:created', onCreated);
    socket.on('file:deleted', onDeleted);
    socket.on('connect', onReconnect);
    return () => {
      socket.off('file:created', onCreated);
      socket.off('file:deleted', onDeleted);
      socket.off('connect', onReconnect);
    };
  }, [socket, load, loadStats, removeFile]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([load('reset'), loadStats()]);
    setRefreshing(false);
  };

  const onEndReached = async () => {
    if (loadingMore || loading || files.length >= total) return;
    setLoadingMore(true);
    await load('more');
    setLoadingMore(false);
  };

  const pickAndUpload = async () => {
    const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: true });
    if (res.canceled) return;
    for (const asset of res.assets) {
      setUpload({ name: asset.name, progress: 0 });
      try {
        await api.uploadFromPhone(asset, (p) => setUpload({ name: asset.name, progress: p }));
      } catch (err) {
        Alert.alert('Upload failed', `${asset.name}: ${err.message}`);
      }
    }
    setUpload(null);
  };

  const header = (
    <View>
      <View style={styles.statsRow}>
        <Stat value={stats?.totalFiles ?? '-'} label="Files" />
        <Stat value={stats ? formatSize(stats.totalBytes) : '-'} label="Stored in S3" />
      </View>
      <AgentBanner agents={agents} connected={connected} />
      <TextInput
        style={styles.search}
        value={search}
        onChangeText={setSearch}
        placeholder="Search files and folders…"
        placeholderTextColor={colors.muted}
        clearButtonMode="while-editing"
        autoCorrect={false}
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {CATEGORIES.map((c) => (
          <Pressable key={c.key} onPress={() => setCategory(c.key)} style={[styles.chip, category === c.key && styles.chipOn]}>
            <Text style={[styles.chipText, category === c.key && styles.chipTextOn]}>{c.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
      {error && <Text style={styles.error}>{error}</Text>}
      <Text style={styles.count}>{total} file{total === 1 ? '' : 's'}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={files}
        keyExtractor={(f) => f.id}
        renderItem={({ item }) => <FileRow file={item} isNew={newIds.has(item.id)} onPress={setSelected} />}
        ListHeaderComponent={header}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator style={{ marginTop: 40 }} />
          ) : (
            <Text style={styles.empty}>No files yet. Drop a file into a synced folder on your laptop and it will appear here.</Text>
          )
        }
        ListFooterComponent={loadingMore ? <ActivityIndicator style={{ margin: 16 }} /> : <View style={{ height: 90 }} />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
        keyboardShouldPersistTaps="handled"
      />

      {upload && (
        <View style={styles.uploadBar}>
          <Text style={styles.uploadText} numberOfLines={1}>
            Uploading {upload.name}… {Math.round(upload.progress * 100)}%
          </Text>
          <View style={styles.bar}>
            <View style={[styles.fill, { width: `${upload.progress * 100}%` }]} />
          </View>
        </View>
      )}

      <Pressable style={({ pressed }) => [styles.fab, pressed && { opacity: 0.8 }]} onPress={pickAndUpload} disabled={!!upload}>
        <Text style={styles.fabText}>＋ Upload</Text>
      </Pressable>

      {selected && (
        <FileDetail
          file={selected}
          api={api}
          onClose={() => setSelected(null)}
          onDeleted={(id) => {
            setSelected(null);
            removeFile(id);
            loadStats();
          }}
        />
      )}
    </View>
  );
}

function Stat({ value, label }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  statsRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 12 },
  stat: { flex: 1, backgroundColor: colors.card, borderRadius: 12, padding: 12 },
  statValue: { fontSize: 20, fontWeight: '700', color: colors.text },
  statLabel: { fontSize: 12, color: colors.muted },
  search: {
    marginHorizontal: 16, marginTop: 12, backgroundColor: colors.card, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: colors.text, borderWidth: 1, borderColor: colors.border,
  },
  chips: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.text, fontSize: 13 },
  chipTextOn: { color: 'white', fontWeight: '600' },
  count: { paddingHorizontal: 16, paddingBottom: 6, color: colors.muted, fontSize: 12 },
  error: { marginHorizontal: 16, color: colors.danger, marginBottom: 6 },
  empty: { textAlign: 'center', color: colors.muted, marginTop: 40, paddingHorizontal: 32 },
  fab: {
    position: 'absolute', right: 16, bottom: 16, backgroundColor: colors.primary, borderRadius: 999,
    paddingHorizontal: 20, paddingVertical: 14, elevation: 4,
  },
  fabText: { color: 'white', fontWeight: '700', fontSize: 15 },
  uploadBar: { position: 'absolute', left: 16, right: 140, bottom: 20, backgroundColor: colors.text, borderRadius: 10, padding: 10 },
  uploadText: { color: 'white', fontSize: 12 },
  bar: { height: 4, backgroundColor: '#334155', borderRadius: 4, marginTop: 6, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: '#60a5fa' },
});
