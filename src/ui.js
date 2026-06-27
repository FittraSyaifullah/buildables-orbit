import { PARTNER_TYPES } from './constants.js';
import { escapeHtml, normalizeCompanyUrl, isValidCoords, formatCoord } from './utils.js';
import { flyToPartner } from './map.js';
import {
  isSynopsisViaServer,
  isProductionEnv,
} from './config.js';
import {
  getSynopsisCache,
  getPartnerSynopsis,
  getApiKeys,
  setApiKeys,
  setPartnerSynopsis,
  renderSynopsis,
  generateSynopsis,
  generateCompanySynopsis,
} from './synopsis.js';
import { searchPlaces } from './geocode.js';

export function buildLegend(partners, activeFilter, searchQuery, onFilter) {
  const el = document.getElementById('legend');
  const counts = Object.fromEntries(
    Object.keys(PARTNER_TYPES).map((key) => [key, partners.filter((p) => p.type === key).length]),
  );

  const allActive = !activeFilter;
  const filterHint = searchQuery?.trim()
    ? `<div class="legend-meta">${partners.length} total · search active</div>`
    : '';

  el.innerHTML =
    filterHint +
    '<div class="legend-title">Filter by type</div>' +
    `<button type="button" class="legend-item${allActive ? ' legend-item--active' : ''}" data-type="">
      <span class="legend-dot legend-dot--all"></span>
      <span class="legend-label">All types</span>
      <span class="legend-count">${partners.length}</span>
    </button>` +
    Object.entries(PARTNER_TYPES)
      .map(([key, { label, color }]) => {
        const count = counts[key] || 0;
        const active = activeFilter === key;
        return `<button type="button" class="legend-item${active ? ' legend-item--active' : ''}" data-type="${key}"${count ? '' : ' disabled'}>
          <span class="legend-dot" style="background:${color}"></span>
          <span class="legend-label">${label}</span>
          <span class="legend-count">${count}</span>
        </button>`;
      })
      .join('');

  el.querySelectorAll('.legend-item:not([disabled])').forEach((btn) => {
    btn.addEventListener('click', () => onFilter?.(btn.dataset.type || null));
  });
}

export function populateTypeSelect(select) {
  select.innerHTML = Object.entries(PARTNER_TYPES)
    .map(([key, { label }]) => `<option value="${key}">${label}</option>`)
    .join('');
}

export function createUI(handlers) {
  let selectedPartnerId = null;
  let confirmCallback = null;
  let formPendingSynopsis = null;

  const tooltip = document.getElementById('pin-tooltip');
  let searchDebounce = null;

  function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.className = `toast toast--${type} toast--visible`;
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => toast.classList.remove('toast--visible'), 3200);
  }

  function setFormError(message) {
    const el = document.getElementById('form-error');
    if (!el) return;
    if (message) {
      el.textContent = message;
      el.hidden = false;
    } else {
      el.hidden = true;
      el.textContent = '';
    }
  }

  function updateSettingsStatus() {
    const el = document.getElementById('settings-synopsis-status');
    const keysSection = document.getElementById('settings-keys-section');
    if (!el) return;

    if (isSynopsisViaServer()) {
      el.className = 'settings-status ok';
      el.textContent = 'Synopsis is configured on the server. No browser keys needed.';
      keysSection.style.display = 'none';
    } else if (isProductionEnv()) {
      el.className = 'settings-status warn';
      el.textContent =
        'Synopsis is not configured on the server. Set EXA_API_KEY and MISTRAL_API_KEY in your hosting environment.';
      keysSection.style.display = 'none';
    } else {
      el.className = 'settings-status warn';
      el.textContent = 'Add EXA_API_KEY and MISTRAL_API_KEY to .env, or enter keys below for this session.';
      keysSection.style.display = 'block';
    }
  }

  function updateLegend(partnerList, activeFilter, query) {
    buildLegend(partnerList, activeFilter, query, handlers.onTypeFilter);
  }

  function updatePartnerCount(visible, total) {
    const el = document.getElementById('partner-count');
    if (!el) return;
    el.textContent = visible !== total ?
      `${visible} of ${total} partners`
    : `${total} partner${total === 1 ? '' : 's'}`;
  }

  function openPanel(id) {
    selectedPartnerId = id;
    handlers.onSelectPartner?.(id);
    const partner = handlers.getPartners().find((p) => p.id === id);
    if (!partner) return;

    if (partner.synopsis) {
      setPartnerSynopsis(partner.id, partner.synopsis);
    }

    flyToPartner(partner);

    const typeInfo = PARTNER_TYPES[partner.type] || { label: partner.type, color: '#64748b' };
    const cachedSynopsis = getPartnerSynopsis(partner);

    document.getElementById('panel-header-content').innerHTML = `
      <div class="partner-name">${escapeHtml(partner.name)}</div>
      <div class="type-badge"><span class="dot" style="background:${typeInfo.color}"></span>${escapeHtml(typeInfo.label)}</div>
    `;

    const tagsHtml =
      partner.tags?.length ?
        `<div class="tags">${partner.tags.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>`
      : '<span style="color:var(--text-muted);font-size:0.875rem">None</span>';

    const websiteHtml = partner.companyUrl
      ? `<div class="panel-section">
          <div class="panel-section-label">Website</div>
          <div class="panel-section-value"><a href="${escapeHtml(partner.companyUrl)}" target="_blank" rel="noopener">${escapeHtml(partner.companyUrl)}</a></div>
        </div>`
      : '';

    document.getElementById('panel-body').innerHTML = `
      ${websiteHtml}
      <div class="panel-section panel-section--highlight">
        <div class="panel-section-label">What we're partnering on</div>
        <div class="panel-section-value">${escapeHtml(partner.workingOn || '—')}</div>
      </div>
      <div class="panel-section">
        <div class="panel-section-label">Company synopsis</div>
        <div id="synopsis-content">${renderSynopsis(cachedSynopsis)}</div>
        <button class="btn" id="btn-synopsis" type="button" style="margin-top:10px">
          ${cachedSynopsis && !cachedSynopsis.error ? 'Refresh synopsis' : 'Generate synopsis'}
        </button>
      </div>
      <div class="panel-section">
        <div class="panel-section-label">Location</div>
        <div class="panel-section-value">${escapeHtml(partner.location || '—')}</div>
        <div class="coords">${partner.lat.toFixed(4)}°, ${partner.lng.toFixed(4)}°</div>
      </div>
      <div class="panel-section">
        <div class="panel-section-label">Tags</div>
        ${tagsHtml}
      </div>
      <div class="panel-actions">
        <button class="btn" id="btn-edit-partner" type="button">Edit</button>
        <button class="btn btn-danger" id="btn-delete-partner" type="button">Delete</button>
      </div>
    `;

    document.getElementById('btn-synopsis').addEventListener('click', () => runSynopsis(partner));
    document.getElementById('btn-edit-partner').addEventListener('click', () => openForm(partner));
    document.getElementById('btn-delete-partner').addEventListener('click', () => confirmDelete(partner));

    document.getElementById('panel-overlay').classList.add('open');
    document.getElementById('detail-panel').classList.add('open');
  }

  function closePanel() {
    selectedPartnerId = null;
    handlers.onDeselectPartner?.();
    document.getElementById('panel-overlay').classList.remove('open');
    document.getElementById('detail-panel').classList.remove('open');
  }

  async function runSynopsis(partner) {
    const contentEl = document.getElementById('synopsis-content');
    const btn = document.getElementById('btn-synopsis');
    contentEl.innerHTML = '<div class="synopsis-box loading">Analyzing company and generating synopsis…</div>';
    btn.disabled = true;

    const result = await generateSynopsis(partner, { onNeedKeys: openSettings });

    if (result) {
      contentEl.innerHTML = renderSynopsis(result);
      btn.textContent = 'Refresh synopsis';
      if (!result.error) {
        const coords = await geocodeFromAnalysis(result, {
          name: partner.name,
          location: partner.location,
          companyUrl: partner.companyUrl || '',
        });
        const updates = { ...partner, synopsis: result };
        if (coords) {
          updates.lat = coords.lat;
          updates.lng = coords.lng;
          updates.location = coords.label || partner.location;
        } else if (result.location && !partner.location) {
          updates.location = result.location;
        }
        handlers.onSavePartner(updates, false);
      }
    }

    btn.disabled = false;
  }

  function renderFormSynopsisPreview(data) {
    document.getElementById('form-synopsis-preview').innerHTML = renderSynopsis(data);
  }

  function setFormCoordinates(lat, lng, label) {
    document.getElementById('form-lat').value = formatCoord(lat);
    document.getElementById('form-lng').value = formatCoord(lng);
    if (label) document.getElementById('form-location').value = label;
  }

  async function geocodeFromAnalysis(result, { name = '', location = '', companyUrl = '' } = {}) {
    if (isValidCoords(result?.lat, result?.lng)) {
      return {
        lat: Number(result.lat),
        lng: Number(result.lng),
        label: result.location || location || '',
      };
    }

    let hostname = '';
    try {
      hostname = companyUrl ? new URL(companyUrl).hostname.replace(/^www\./, '') : '';
    } catch {
      hostname = '';
    }

    const queries = [
      result?.locationQuery && name ? `${name}, ${result.locationQuery}` : '',
      result?.locationQuery,
      name && result?.locationQuery ? `${name} ${result.locationQuery}` : '',
      result?.location,
      location && name ? `${name}, ${location}` : '',
      location,
      name ? `${name} headquarters` : '',
      name ? `${name} head office` : '',
      hostname && name ? `${name} ${hostname}` : '',
      name,
    ]
      .map((q) => String(q || '').trim())
      .filter(Boolean);

    const seen = new Set();
    for (const query of queries) {
      const key = query.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      try {
        const results = await searchPlaces(query);
        if (results[0]) {
          return { lat: results[0].lat, lng: results[0].lng, label: results[0].label };
        }
      } catch {
        // try next query
      }
    }
    return null;
  }

  async function resolveFormCoordinates(result) {
    return geocodeFromAnalysis(result, {
      name: document.getElementById('form-name').value.trim(),
      location: document.getElementById('form-location').value.trim(),
      companyUrl: normalizeCompanyUrl(document.getElementById('form-url').value) || '',
    });
  }

  async function applyAnalyzeResult(result) {
    if (!result || result.error) return false;

    formPendingSynopsis = result;
    renderFormSynopsisPreview(result);

    const resultsEl = document.getElementById('geocode-results');
    resultsEl.innerHTML = '<p class="form-hint">Resolving headquarters coordinates…</p>';

    const coords = await resolveFormCoordinates(result);
    if (coords) {
      setFormCoordinates(coords.lat, coords.lng, coords.label);
      resultsEl.innerHTML = `<p class="form-hint form-hint--ok">Location set: ${coords.label || 'Coordinates resolved'} (${formatCoord(coords.lat)}°, ${formatCoord(coords.lng)}°)</p>`;
      return true;
    }

    resultsEl.innerHTML =
      '<p class="form-hint form-hint--error">Could not resolve coordinates — enter a place and click Look up, or click the globe.</p>';
    return false;
  }

  async function runCompanyAnalyze() {
    const name = document.getElementById('form-name').value.trim();
    const urlInput = document.getElementById('form-url').value.trim();
    const preview = document.getElementById('form-synopsis-preview');
    const btn = document.getElementById('form-analyze');

    if (!name) {
      preview.innerHTML = renderSynopsis({ error: 'Enter a company name first.' });
      document.getElementById('form-name').focus();
      return;
    }

    const companyUrl = normalizeCompanyUrl(urlInput);
    if (!companyUrl) {
      preview.innerHTML = renderSynopsis({ error: 'Enter a valid website URL (e.g. https://company.com).' });
      document.getElementById('form-url').focus();
      return;
    }

    document.getElementById('form-url').value = companyUrl;
    btn.disabled = true;
    preview.innerHTML =
      '<div class="synopsis-box loading">Analyzing company, synopsis, and headquarters location…</div>';
    document.getElementById('geocode-results').innerHTML = '<p class="form-hint">Locating company on the globe…</p>';

    const result = await generateCompanySynopsis(
      {
        name,
        companyUrl,
        location: document.getElementById('form-location').value.trim(),
        type: document.getElementById('form-type').value,
      },
      { onNeedKeys: openSettings },
    );

    btn.disabled = false;

    if (result) {
      await applyAnalyzeResult(result);
    }
  }

  function openForm(partner, lat, lng) {
    const isEdit = !!partner;
    document.getElementById('form-modal-title').textContent = isEdit ? 'Edit partner' : 'Add partner';
    document.getElementById('form-id').value = partner?.id || '';
    document.getElementById('form-name').value = partner?.name || '';
    document.getElementById('form-url').value = partner?.companyUrl || '';
    document.getElementById('form-type').value = partner?.type || 'client';
    document.getElementById('form-location').value = partner?.location || '';
    document.getElementById('form-lat').value =
      partner?.lat != null ? formatCoord(partner.lat) : lat != null && lat !== '' ? formatCoord(lat) : '';
    document.getElementById('form-lng').value =
      partner?.lng != null ? formatCoord(partner.lng) : lng != null && lng !== '' ? formatCoord(lng) : '';
    document.getElementById('form-working').value = partner?.workingOn || '';
    document.getElementById('form-tags').value = (partner?.tags || []).join(', ');
    document.getElementById('geocode-results').innerHTML = '';
    formPendingSynopsis = partner?.synopsis || null;
    renderFormSynopsisPreview(formPendingSynopsis);
    setFormError('');
    document.getElementById('form-modal-overlay').classList.add('open');
    setTimeout(() => document.getElementById(isEdit ? 'form-working' : 'form-name').focus(), 50);
  }

  async function runGeocode() {
    const input = document.getElementById('form-location');
    const resultsEl = document.getElementById('geocode-results');
    const query = input.value.trim();

    if (!query) {
      resultsEl.innerHTML = '<p class="form-hint form-hint--error">Enter a place name to look up.</p>';
      return;
    }

    resultsEl.innerHTML = '<p class="form-hint">Searching…</p>';

    try {
      const results = await searchPlaces(query);
      if (!results.length) {
        resultsEl.innerHTML = '<p class="form-hint form-hint--error">No results found. Try a different search.</p>';
        return;
      }

      resultsEl.innerHTML = results
        .map(
          (r, i) =>
            `<button type="button" class="geocode-result" data-idx="${i}">
              <span class="geocode-result-label">${escapeHtml(r.label)}</span>
              <span class="geocode-result-coords">${r.lat.toFixed(4)}°, ${r.lng.toFixed(4)}°</span>
            </button>`,
        )
        .join('');

      resultsEl.querySelectorAll('.geocode-result').forEach((btn) => {
        btn.addEventListener('click', () => {
          const r = results[Number(btn.dataset.idx)];
          input.value = r.label;
          setFormCoordinates(r.lat, r.lng, r.label);
          resultsEl.innerHTML = `<p class="form-hint form-hint--ok">Location selected: ${formatCoord(r.lat)}°, ${formatCoord(r.lng)}°</p>`;
        });
      });
    } catch (err) {
      resultsEl.innerHTML = `<p class="form-hint form-hint--error">${escapeHtml(err.message)}</p>`;
    }
  }

  function closeForm() {
    formPendingSynopsis = null;
    setFormError('');
    document.getElementById('form-modal-overlay').classList.remove('open');
  }

  async function saveForm(e) {
    e.preventDefault();
    const existingId = document.getElementById('form-id').value;
    const isNew = !existingId;
    const saveBtn = document.getElementById('form-save');

    const name = document.getElementById('form-name').value.trim();
    if (!name) {
      setFormError('Company name is required.');
      document.getElementById('form-name').focus();
      return;
    }

    const companyUrl = normalizeCompanyUrl(document.getElementById('form-url').value) || '';
    setFormError('');

    if (companyUrl && (!formPendingSynopsis || formPendingSynopsis.error)) {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Analyzing company…';
      document.getElementById('form-synopsis-preview').innerHTML =
        '<div class="synopsis-box loading">Analyzing company, synopsis, and headquarters location…</div>';

      const result = await generateCompanySynopsis(
        {
          name,
          companyUrl,
          location: document.getElementById('form-location').value.trim(),
          type: document.getElementById('form-type').value,
        },
        { onNeedKeys: openSettings },
      );

      saveBtn.disabled = false;
      saveBtn.textContent = 'Save partner';

      if (result && !result.error) {
        await applyAnalyzeResult(result);
      }
    }

    const lat = parseFloat(document.getElementById('form-lat').value);
    const lng = parseFloat(document.getElementById('form-lng').value);

    if (!isValidCoords(lat, lng)) {
      setFormError('Valid coordinates required. Analyze the website or use Look up / click the globe.');
      return;
    }

    const partner = {
      id: existingId || handlers.generateId(),
      name,
      type: document.getElementById('form-type').value,
      lat,
      lng,
      location: document.getElementById('form-location').value.trim(),
      companyUrl,
      workingOn: document.getElementById('form-working').value.trim(),
      tags: document
        .getElementById('form-tags')
        .value.split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    };

    if (formPendingSynopsis && !formPendingSynopsis.error) {
      partner.synopsis = formPendingSynopsis;
    } else if (existingId) {
      const existing = handlers.getPartners().find((p) => p.id === existingId);
      if (existing?.synopsis) partner.synopsis = existing.synopsis;
    }

    handlers.onSavePartner(partner, isNew);
    closeForm();
    showToast(isNew ? `${name} added to the globe` : `${name} updated`, 'success');
    if (selectedPartnerId === partner.id || isNew) openPanel(partner.id);
  }

  function confirmDelete(partner) {
    showConfirm(`Remove <strong>${escapeHtml(partner.name)}</strong> from the globe?`, () => {
      getSynopsisCache().delete(partner.id);
      handlers.onDeletePartner(partner.id);
      closePanel();
      showToast(`${partner.name} removed`, 'info');
    });
  }

  function openSettings() {
    const keys = getApiKeys();
    document.getElementById('settings-exa-key').value = keys.exaApiKey;
    document.getElementById('settings-mistral-key').value = keys.mistralApiKey;
    updateSettingsStatus();
    document.getElementById('settings-modal-overlay').classList.add('open');
  }

  function closeSettings() {
    setApiKeys(
      document.getElementById('settings-exa-key').value.trim(),
      document.getElementById('settings-mistral-key').value.trim(),
    );
    document.getElementById('settings-modal-overlay').classList.remove('open');
  }

  function showConfirm(text, onOk) {
    document.getElementById('confirm-modal-text').innerHTML = text;
    confirmCallback = onOk;
    document.getElementById('confirm-modal-overlay').classList.add('open');
  }

  function closeConfirm() {
    document.getElementById('confirm-modal-overlay').classList.remove('open');
    confirmCallback = null;
  }

  function handleHover(partner, x, y) {
    if (partner) {
      const typeLabel = PARTNER_TYPES[partner.type]?.label || partner.type;
      const workSnippet = partner.workingOn
        ? `<span class="tooltip-work">${escapeHtml(partner.workingOn.length > 72 ? `${partner.workingOn.slice(0, 72)}…` : partner.workingOn)}</span>`
        : '';
      tooltip.innerHTML = `<strong>${escapeHtml(partner.name)}</strong><span>${escapeHtml(typeLabel)}</span>${workSnippet}`;
      tooltip.style.left = `${x}px`;
      tooltip.style.top = `${y}px`;
      tooltip.classList.add('visible');
    } else {
      tooltip.classList.remove('visible');
    }
  }

  function setSearchQuery(value) {
    const input = document.getElementById('partner-search');
    if (input) input.value = value;
  }

  async function handleImport(replace) {
    const input = document.getElementById('import-file');
    const file = input.files?.[0];
    if (!file) {
      showToast('Choose a JSON file to import', 'error');
      return;
    }

    try {
      const count = await handlers.onImport(file, replace);
      input.value = '';
      closeSettings();
      closePanel();
      handlers.onImportComplete?.();
      showToast(
        replace ?
          `Replaced data with ${count} imported partner${count === 1 ? '' : 's'}`
        : `Imported ${count} partner${count === 1 ? '' : 's'}`,
        'success',
      );
    } catch (err) {
      showToast(err.message || 'Import failed', 'error');
    }
  }

  populateTypeSelect(document.getElementById('form-type'));

  document.getElementById('btn-add-partner').addEventListener('click', () => openForm());
  document.getElementById('btn-reset-view').addEventListener('click', () => handlers.onResetView?.());
  document.getElementById('btn-settings').addEventListener('click', openSettings);
  document.getElementById('panel-close').addEventListener('click', closePanel);
  document.getElementById('panel-overlay').addEventListener('click', closePanel);

  document.querySelectorAll('.form-modal-close').forEach((el) => el.addEventListener('click', closeForm));
  document.getElementById('partner-form').addEventListener('submit', saveForm);
  document.getElementById('form-geocode').addEventListener('click', runGeocode);
  document.getElementById('form-analyze').addEventListener('click', runCompanyAnalyze);
  document.getElementById('form-location').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      runGeocode();
    }
  });
  document.getElementById('form-url').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      runCompanyAnalyze();
    }
  });

  document.querySelectorAll('.settings-modal-close').forEach((el) => el.addEventListener('click', closeSettings));

  document.getElementById('btn-reset-data').addEventListener('click', () => {
    showConfirm('Reset all custom partner data and restore the original sample set?', () => {
      handlers.onResetData();
      closePanel();
      closeSettings();
      showToast('Partner data reset to sample set', 'info');
    });
  });

  document.getElementById('btn-export').addEventListener('click', () => {
    handlers.onExport?.();
    showToast('Partners exported', 'success');
  });

  document.getElementById('btn-import-merge').addEventListener('click', () => handleImport(false));

  document.getElementById('btn-import-replace').addEventListener('click', () => {
    showConfirm('Replace all partner data with the imported file?', () => handleImport(true));
  });

  document.getElementById('import-file').addEventListener('change', () => {
    const file = document.getElementById('import-file').files?.[0];
    if (file) showToast(`Selected ${file.name}`, 'info');
  });

  document.getElementById('partner-search').addEventListener('input', (e) => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => handlers.onSearch?.(e.target.value), 180);
  });

  document.getElementById('confirm-cancel').addEventListener('click', closeConfirm);
  document.getElementById('confirm-ok').addEventListener('click', () => {
    confirmCallback?.();
    closeConfirm();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (document.getElementById('confirm-modal-overlay').classList.contains('open')) {
      closeConfirm();
      return;
    }
    if (document.getElementById('form-modal-overlay').classList.contains('open')) {
      closeForm();
      return;
    }
    if (document.getElementById('settings-modal-overlay').classList.contains('open')) {
      closeSettings();
      return;
    }
    if (document.getElementById('detail-panel').classList.contains('open')) {
      closePanel();
    }
  });

  return {
    openPanel,
    openForm,
    handleHover,
    updateSettingsStatus,
    updateLegend,
    updatePartnerCount,
    setSearchQuery,
  };
}
