import { STORAGE_KEY, SEED_PARTNERS, PARTNER_TYPES } from './constants.js';
import { generateId } from './utils.js';

export { generateId };

function loadOverrides() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : { added: [], edits: {}, deleted: [] };
  } catch {
    return { added: [], edits: {}, deleted: [] };
  }
}

function saveOverrides(overrides) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
}

export function mergePartners() {
  const overrides = loadOverrides();
  const deleted = new Set(overrides.deleted || []);

  const merged = SEED_PARTNERS
    .filter((p) => !deleted.has(p.id))
    .map((p) => (overrides.edits[p.id] ? { ...p, ...overrides.edits[p.id] } : { ...p }));

  (overrides.added || []).forEach((p) => {
    if (!deleted.has(p.id)) {
      merged.push(overrides.edits[p.id] ? { ...p, ...overrides.edits[p.id] } : { ...p });
    }
  });

  return merged;
}

function normalizeImportedPartner(raw) {
  if (!raw?.name?.trim()) throw new Error('Each partner needs a company name.');
  const lat = Number(raw.lat);
  const lng = Number(raw.lng);
  if (Number.isNaN(lat) || Number.isNaN(lng)) throw new Error(`Invalid coordinates for "${raw.name}".`);

  const type = PARTNER_TYPES[raw.type] ? raw.type : 'client';

  return {
    id: raw.id?.trim() || generateId(),
    name: raw.name.trim(),
    type,
    lat,
    lng,
    location: String(raw.location || '').trim(),
    companyUrl: String(raw.companyUrl || '').trim(),
    workingOn: String(raw.workingOn || '').trim(),
    tags: Array.isArray(raw.tags) ? raw.tags.map((t) => String(t).trim()).filter(Boolean) : [],
    synopsis: raw.synopsis?.text ? { text: raw.synopsis.text, source: raw.synopsis.source || '' } : raw.synopsis || undefined,
  };
}

export function exportPartnerData() {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    partners: mergePartners(),
  };
}

export function importPartners(items, { replace = false } = {}) {
  if (!Array.isArray(items)) throw new Error('Import file must contain a partners array.');
  const normalized = items.map(normalizeImportedPartner);

  if (replace) {
    saveOverrides({
      added: normalized,
      edits: {},
      deleted: SEED_PARTNERS.map((s) => s.id),
    });
    return normalized.length;
  }

  const overrides = loadOverrides();
  const existingIds = new Set([
    ...SEED_PARTNERS.map((s) => s.id),
    ...(overrides.added || []).map((p) => p.id),
  ]);

  const toAdd = normalized.map((p) => {
    if (existingIds.has(p.id)) return { ...p, id: generateId() };
    existingIds.add(p.id);
    return p;
  });

  overrides.added = [...(overrides.added || []), ...toAdd];
  saveOverrides(overrides);
  return toAdd.length;
}

export function persistPartner(partner, isNew) {
  const overrides = loadOverrides();
  overrides.added = overrides.added || [];
  overrides.edits = overrides.edits || {};

  if (isNew) {
    overrides.added.push(partner);
  } else if (SEED_PARTNERS.some((s) => s.id === partner.id)) {
    overrides.edits[partner.id] = { ...partner };
  } else {
    overrides.added = overrides.added.map((a) => (a.id === partner.id ? partner : a));
  }
  saveOverrides(overrides);
}

export function deletePartner(id) {
  const overrides = loadOverrides();
  overrides.deleted = overrides.deleted || [];
  if (!overrides.deleted.includes(id)) overrides.deleted.push(id);
  overrides.added = (overrides.added || []).filter((a) => a.id !== id);
  if (overrides.edits) delete overrides.edits[id];
  saveOverrides(overrides);
}

export function resetAllData() {
  localStorage.removeItem(STORAGE_KEY);
}
