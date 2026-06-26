import { STORAGE_KEY, SEED_PARTNERS } from './constants.js';
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
