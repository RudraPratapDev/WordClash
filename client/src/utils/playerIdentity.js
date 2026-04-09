export function getPlayerBadge(playerOrName) {
  const name = typeof playerOrName === 'string' ? playerOrName : playerOrName?.name;
  if (!name || typeof name !== 'string') return 'PL';

  const cleaned = name.trim();
  if (!cleaned) return 'PL';

  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  const first = parts[0][0] || '';
  const last = parts[parts.length - 1][0] || '';
  return `${first}${last}`.toUpperCase();
}
