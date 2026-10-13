// Small colour helpers shared across the app.

const normalizeHex = value => {
  const raw = String(value || '').trim();
  const hex = raw.startsWith('#') ? raw.slice(1) : raw;
  if (/^[0-9a-fA-F]{3}$/.test(hex)) {
    return hex
      .split('')
      .map(char => char + char)
      .join('');
  }
  if (/^[0-9a-fA-F]{6}$/.test(hex)) {
    return hex;
  }
  return null;
};

export const withAlpha = (value, alpha) => {
  const hex = normalizeHex(value);
  const safeAlpha = Math.min(1, Math.max(0, alpha));
  if (!hex) {
    return `rgba(0,0,0,${safeAlpha})`;
  }
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${safeAlpha})`;
};
