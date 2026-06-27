export function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

export function generateId() {
  return `custom-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function normalizeCompanyUrl(input) {
  const trimmed = String(input || '').trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function isValidCoords(lat, lng) {
  const la = Number(lat);
  const ln = Number(lng);
  return (
    !Number.isNaN(la) &&
    !Number.isNaN(ln) &&
    la >= -90 &&
    la <= 90 &&
    ln >= -180 &&
    ln <= 180
  );
}

export function formatCoord(value) {
  return Number(value).toFixed(6);
}
