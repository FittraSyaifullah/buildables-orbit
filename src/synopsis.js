import { isSynopsisViaServer } from './config.js';

const synopsisCache = new Map();
let exaApiKey = '';
let mistralApiKey = '';

export function getSynopsisCache() {
  return synopsisCache;
}

export function getApiKeys() {
  return { exaApiKey, mistralApiKey };
}

export function setApiKeys(exa, mistral) {
  exaApiKey = exa;
  mistralApiKey = mistral;
}

export function renderSynopsis(data) {
  if (!data) {
    return '<div class="synopsis-box" style="color:var(--text-muted);font-size:0.875rem">No synopsis yet. Click Generate to search the web.</div>';
  }
  if (data.error) {
    return `<div class="synopsis-box error">${escapeHtml(data.error)}</div>`;
  }
  const source = data.source
    ? `<div class="synopsis-source">Source: <a href="${escapeHtml(data.source)}" target="_blank" rel="noopener">${escapeHtml(data.source)}</a></div>`
    : '';
  return `<div class="synopsis-box">${escapeHtml(data.text)}${source}</div>`;
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

export async function generateSynopsis(partner, { onNeedKeys } = {}) {
  if (!isSynopsisViaServer() && (!exaApiKey || !mistralApiKey)) {
    onNeedKeys?.();
    return null;
  }

  const res = await fetch('/api/synopsis', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: partner.name,
      location: partner.location,
      type: partner.type,
      workingOn: partner.workingOn,
      tags: partner.tags,
      exaKey: exaApiKey || undefined,
      mistralKey: mistralApiKey || undefined,
    }),
  });

  const data = await res.json();

  if (res.status === 503 && !isSynopsisViaServer()) {
    onNeedKeys?.();
    return null;
  }

  if (!res.ok || data.error) {
    const result = { error: data.error || `Request failed (${res.status})` };
    synopsisCache.set(partner.id, result);
    return result;
  }

  const result = { text: data.text, source: data.source };
  synopsisCache.set(partner.id, result);
  return result;
}
