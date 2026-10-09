export function formatSize(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`;
}

export function timeAgo(date) {
  if (!date) return '';
  const s = Math.max(0, (Date.now() - new Date(date).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} d ago`;
  return new Date(date).toLocaleDateString();
}

export const CATEGORIES = [
  { key: 'all', label: 'All' },
  { key: 'image', label: 'Images' },
  { key: 'video', label: 'Videos' },
  { key: 'document', label: 'Docs' },
  { key: 'audio', label: 'Audio' },
  { key: 'archive', label: 'Archives' },
  { key: 'other', label: 'Other' },
];

export const CATEGORY_COLORS = {
  image: '#8b5cf6',
  video: '#ef4444',
  document: '#2563eb',
  audio: '#f59e0b',
  archive: '#64748b',
  other: '#0f766e',
};

export const colors = {
  bg: '#f1f5f9',
  card: '#ffffff',
  text: '#0f172a',
  muted: '#64748b',
  border: '#e2e8f0',
  primary: '#2563eb',
  danger: '#dc2626',
  success: '#16a34a',
};
