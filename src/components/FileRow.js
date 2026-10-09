import { memo } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { CATEGORY_COLORS, colors, formatSize, timeAgo } from '../format';

export function FileThumb({ file, size = 48 }) {
  if (file.category === 'image' && file.viewUrl) {
    return <Image source={{ uri: file.viewUrl }} style={{ width: size, height: size, borderRadius: 10, backgroundColor: colors.border }} />;
  }
  return (
    <View style={[styles.icon, { width: size, height: size, backgroundColor: CATEGORY_COLORS[file.category] || colors.muted }]}>
      <Text style={styles.ext} numberOfLines={1}>
        {(file.extension || '?').toUpperCase().slice(0, 4)}
      </Text>
    </View>
  );
}

function FileRow({ file, isNew, onPress }) {
  return (
    <Pressable onPress={() => onPress(file)} style={({ pressed }) => [styles.row, isNew && styles.newRow, pressed && styles.pressed]}>
      <FileThumb file={file} />
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>
          {file.fileName}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {formatSize(file.sizeBytes)} · {timeAgo(file.uploadedAt)}
          {file.folderName ? ` · ${file.folderName}` : file.source === 'mobile' ? ' · from phone' : ''}
        </Text>
      </View>
      {isNew && <Text style={styles.badge}>NEW</Text>}
    </Pressable>
  );
}

export default memo(FileRow);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  newRow: { backgroundColor: '#eff6ff' },
  pressed: { opacity: 0.6 },
  icon: { borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  ext: { color: 'white', fontWeight: '700', fontSize: 11 },
  info: { flex: 1, minWidth: 0 },
  name: { fontSize: 15, fontWeight: '500', color: colors.text },
  meta: { fontSize: 12, color: colors.muted, marginTop: 2 },
  badge: { fontSize: 10, fontWeight: '700', color: colors.primary },
});
