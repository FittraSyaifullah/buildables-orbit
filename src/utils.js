export function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

export function generateId() {
  return `custom-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
