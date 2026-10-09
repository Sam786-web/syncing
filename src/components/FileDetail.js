import { useState } from 'react';
import { ActivityIndicator, Alert, Image, Linking, Modal, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FileThumb } from './FileRow';
import { colors, formatSize } from '../format';

export default function FileDetail({ file, api, onClose, onDeleted }) {
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(null);

  if (!file) return null;

  const withFreshUrl = async (label, download, fn) => {
    setBusy(label);
    try {
      const { url } = await api.fileUrl(file.id, download); // links expire, so always get a fresh one
      await fn(url);
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setBusy(null);
    }
  };

  const confirmDelete = () =>
    Alert.alert('Delete file?', `"${file.fileName}" will be permanently removed from S3.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setBusy('delete');
          try {
            await api.deleteFile(file.id);
            onDeleted(file.id);
          } catch (err) {
            Alert.alert('Error', err.message);
          } finally {
            setBusy(null);
          }
        },
      },
    ]);

  const rows = [
    ['Path', file.relativePath],
    ['Folder', file.folderName || (file.source === 'mobile' ? 'Uploaded from phone' : '-')],
    ['Size', formatSize(file.sizeBytes)],
    ['Type', file.mimeType],
    ['From', file.sourceDevice || '-'],
    ['Uploaded', file.uploadedAt ? new Date(file.uploadedAt).toLocaleString() : '-'],
    ['S3 URL', file.s3Url],
  ];

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={styles.close}>✕ Close</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.body}>
          {file.category === 'image' && file.viewUrl ? (
            <Image source={{ uri: file.viewUrl }} style={styles.preview} resizeMode="contain" />
          ) : (
            <View style={styles.center}>
              <FileThumb file={file} size={96} />
            </View>
          )}
          <Text style={styles.title} selectable>
            {file.fileName}
          </Text>

          <View style={styles.actions}>
            <Action label="Open" busy={busy === 'open'} onPress={() => withFreshUrl('open', false, Linking.openURL)} />
            <Action label="Download" busy={busy === 'download'} onPress={() => withFreshUrl('download', true, Linking.openURL)} />
            <Action
              label="Share link"
              busy={busy === 'share'}
              onPress={() => withFreshUrl('share', false, (url) => Share.share({ message: `${file.fileName}\n${url}` }))}
            />
          </View>

          <View style={styles.table}>
            {rows.map(([k, v]) => (
              <View key={k} style={styles.tr}>
                <Text style={styles.k}>{k}</Text>
                <Text style={styles.v} selectable>
                  {v}
                </Text>
              </View>
            ))}
          </View>
          <Text style={styles.note}>Shared links work for 1 hour (set by SIGNED_URL_TTL on the server).</Text>

          <Pressable style={styles.delete} onPress={confirmDelete} disabled={!!busy}>
            {busy === 'delete' ? <ActivityIndicator color={colors.danger} /> : <Text style={styles.deleteText}>Delete from cloud</Text>}
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

function Action({ label, onPress, busy }) {
  return (
    <Pressable style={({ pressed }) => [styles.action, pressed && { opacity: 0.7 }]} onPress={onPress} disabled={busy}>
      {busy ? <ActivityIndicator color="white" /> : <Text style={styles.actionText}>{label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: 16, paddingVertical: 12 },
  close: { color: colors.primary, fontSize: 16, fontWeight: '600' },
  body: { padding: 16, paddingTop: 0 },
  preview: { width: '100%', height: 320, borderRadius: 12, backgroundColor: '#0f172a' },
  center: { alignItems: 'center', paddingVertical: 24 },
  title: { fontSize: 20, fontWeight: '700', color: colors.text, marginTop: 16 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 16 },
  action: { flex: 1, backgroundColor: colors.primary, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  actionText: { color: 'white', fontWeight: '600' },
  table: { backgroundColor: colors.card, borderRadius: 12, marginTop: 16, paddingHorizontal: 12 },
  tr: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  k: { fontSize: 12, color: colors.muted },
  v: { fontSize: 14, color: colors.text, marginTop: 2 },
  note: { fontSize: 12, color: colors.muted, marginTop: 8 },
  delete: { marginTop: 24, padding: 14, borderRadius: 10, borderWidth: 1, borderColor: '#fecaca', alignItems: 'center', backgroundColor: '#fef2f2' },
  deleteText: { color: colors.danger, fontWeight: '600' },
});
