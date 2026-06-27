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

export function getPartnerSynopsis(partner) {
  if (!partner) return null;
  return synopsisCache.get(partner.id) || partner.synopsis || null;
}

export function setPartnerSynopsis(partnerId, synopsis) {
  if (synopsis && !synopsis.error) {
    synopsisCache.set(partnerId, synopsis);
  } else if (synopsis?.error) {
    synopsisCache.set(partnerId, synopsis);
  }
}

export function renderSynopsis(data) {
  if (!data) {
    return '<div class="synopsis-box synopsis-box--empty">No company synopsis yet. Add a website URL and analyze, or generate from the detail panel.</div>';
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

async function requestSynopsis(payload, { onNeedKeys } = {}) {
  if (!isSynopsisViaServer() && (!exaApiKey || !mistralApiKey)) {
    onNeedKeys?.();
    return null;
  }

  const res = await fetch('/api/synopsis', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...payload,
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
    return { error: data.error || `Request failed (${res.status})` };
  }

  return {
    text: data.text,
    source: data.source,
    location: data.location || '',
    lat: data.lat ?? null,
    lng: data.lng ?? null,
  };
}

export async function generateCompanySynopsis({ name, companyUrl, location, type }, { onNeedKeys } = {}) {
  return requestSynopsis(
    {
      name,
      companyUrl,
      location,
      type,
      mode: 'company',
    },
    { onNeedKeys },
  );
}

export async function generateSynopsis(partner, { onNeedKeys } = {}) {
  const result = await requestSynopsis(
    {
      name: partner.name,
      location: partner.location,
      type: partner.type,
      workingOn: partner.workingOn,
      tags: partner.tags,
      companyUrl: partner.companyUrl,
      mode: partner.companyUrl ? 'company' : 'full',
    },
    { onNeedKeys },
  );

  if (!result) return null;

  if (partner.id) {
    setPartnerSynopsis(partner.id, result);
  }

  return result;
}
