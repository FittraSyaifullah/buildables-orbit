import { PARTNER_TYPES, TAG_LAYOUT } from './constants.js';
import { escapeHtml } from './utils.js';
import {
  isSynopsisViaServer,
  isProductionEnv,
} from './config.js';
import {
  getSynopsisCache,
  getApiKeys,
  setApiKeys,
  renderSynopsis,
  generateSynopsis,
} from './synopsis.js';
import { searchPlaces } from './geocode.js';

export function buildFloatingTags(partners, activeTag, onTagClick) {
  const el = document.getElementById('floating-tags');
  if (!el) return;

  const tags = [...new Set(partners.flatMap((p) => p.tags || []).map((t) => t.toLowerCase()))].slice(0, TAG_LAYOUT.length);

  el.innerHTML = tags
    .map((tag, i) => {
      const pos = TAG_LAYOUT[i] || TAG_LAYOUT[TAG_LAYOUT.length - 1];
      const active = activeTag && activeTag.toLowerCase() === tag;
      return `<button
        type="button"
        class="floating-tag${active ? ' floating-tag--active' : ''}"
        style="top:${pos.top};left:${pos.left}"
        data-tag="${escapeHtml(tag)}"
      >${escapeHtml(tag)}</button>`;
    })
    .join('');

  el.querySelectorAll('.floating-tag').forEach((btn) => {
    btn.addEventListener('click', () => onTagClick?.(btn.dataset.tag));
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

  const tooltip = document.getElementById('pin-tooltip');

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

  function openPanel(id) {
    selectedPartnerId = id;
    handlers.onPartnerSelect?.(id);

    const partner = handlers.getPartners().find((p) => p.id === id);
    if (!partner) return;

    handlers.flyToPartner?.(partner);

    const typeInfo = PARTNER_TYPES[partner.type] || { label: partner.type, color: '#888' };
    const cachedSynopsis = getSynopsisCache().get(id);

    document.getElementById('panel-header-content').innerHTML = `
      <div class="partner-name">${escapeHtml(partner.name)}</div>
      <div class="type-badge">${escapeHtml(typeInfo.label)}</div>
    `;

    const tagsHtml =
      partner.tags?.length ?
        `<div class="tags">${partner.tags.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>`
      : '<span class="panel-muted">None</span>';

    document.getElementById('panel-body').innerHTML = `
      <div class="panel-section">
        <div class="panel-section-label">Location</div>
        <div class="panel-section-value">${escapeHtml(partner.location || '—')}</div>
        <div class="coords">${partner.lat.toFixed(4)}°, ${partner.lng.toFixed(4)}°</div>
      </div>
      <div class="panel-section">
        <div class="panel-section-label">Current work</div>
        <div class="panel-section-value">${escapeHtml(partner.workingOn || '—')}</div>
      </div>
      <div class="panel-section">
        <div class="panel-section-label">Tags</div>
        ${tagsHtml}
      </div>
      <div class="panel-section">
        <div class="panel-section-label">Synopsis</div>
        <div id="synopsis-content">${renderSynopsis(cachedSynopsis)}</div>
        <button class="btn" id="btn-synopsis" type="button" style="margin-top:10px">
          ${cachedSynopsis && !cachedSynopsis.error ? 'Refresh synopsis' : 'Generate synopsis'}
        </button>
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
    handlers.onPartnerDeselect?.();
    document.getElementById('panel-overlay').classList.remove('open');
    document.getElementById('detail-panel').classList.remove('open');
  }

  async function runSynopsis(partner) {
    const contentEl = document.getElementById('synopsis-content');
    const btn = document.getElementById('btn-synopsis');
    contentEl.innerHTML = '<div class="synopsis-box loading">Searching the web and generating summary…</div>';
    btn.disabled = true;

    const result = await generateSynopsis(partner, { onNeedKeys: openSettings });

    if (result) {
      contentEl.innerHTML = renderSynopsis(result);
      btn.textContent = 'Refresh synopsis';
    }

    btn.disabled = false;
  }

  function openForm(partner, lat, lng) {
    closeSearch();
    const isEdit = !!partner;
    document.getElementById('form-modal-title').textContent = isEdit ? 'Edit partner' : 'Add partner';
    document.getElementById('form-id').value = partner?.id || '';
    document.getElementById('form-name').value = partner?.name || '';
    document.getElementById('form-type').value = partner?.type || 'client';
    document.getElementById('form-location').value = partner?.location || '';
    document.getElementById('form-lat').value = partner?.lat ?? lat ?? '';
    document.getElementById('form-lng').value = partner?.lng ?? lng ?? '';
    document.getElementById('form-working').value = partner?.workingOn || '';
    document.getElementById('form-tags').value = (partner?.tags || []).join(', ');
    document.getElementById('geocode-results').innerHTML = '';
    document.getElementById('form-modal-overlay').classList.add('open');
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
        resultsEl.innerHTML = '<p class="form-hint form-hint--error">No results found.</p>';
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
          document.getElementById('form-lat').value = r.lat;
          document.getElementById('form-lng').value = r.lng;
          resultsEl.innerHTML = '';
        });
      });
    } catch (err) {
      resultsEl.innerHTML = `<p class="form-hint form-hint--error">${escapeHtml(err.message)}</p>`;
    }
  }

  function closeForm() {
    document.getElementById('form-modal-overlay').classList.remove('open');
  }

  function saveForm(e) {
    e.preventDefault();
    const existingId = document.getElementById('form-id').value;
    const isNew = !existingId;

    const partner = {
      id: existingId || handlers.generateId(),
      name: document.getElementById('form-name').value.trim(),
      type: document.getElementById('form-type').value,
      lat: parseFloat(document.getElementById('form-lat').value),
      lng: parseFloat(document.getElementById('form-lng').value),
      location: document.getElementById('form-location').value.trim(),
      workingOn: document.getElementById('form-working').value.trim(),
      tags: document
        .getElementById('form-tags')
        .value.split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    };

    handlers.onSavePartner(partner, isNew);
    closeForm();
    if (selectedPartnerId === partner.id || isNew) openPanel(partner.id);
  }

  function confirmDelete(partner) {
    showConfirm(`Remove <strong>${escapeHtml(partner.name)}</strong> from the globe?`, () => {
      getSynopsisCache().delete(partner.id);
      handlers.onDeletePartner(partner.id);
      closePanel();
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

  function openSearch() {
    document.getElementById('search-modal-overlay').classList.add('open');
    const input = document.getElementById('search-input');
    input.value = '';
    renderSearchResults('');
    setTimeout(() => input.focus(), 100);
  }

  function closeSearch() {
    document.getElementById('search-modal-overlay').classList.remove('open');
  }

  function renderSearchResults(query) {
    const resultsEl = document.getElementById('search-results');
    const q = query.trim().toLowerCase();
    const list = handlers.getFilteredPartners?.() || handlers.getPartners();

    const matches = q ?
      list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.location?.toLowerCase().includes(q) ||
          p.tags?.some((t) => t.toLowerCase().includes(q)),
      )
    : list;

    if (!matches.length) {
      resultsEl.innerHTML = '<p class="form-hint">No partners found.</p>';
      return;
    }

    resultsEl.innerHTML = matches
      .map(
        (p) =>
          `<button type="button" class="search-result" data-id="${escapeHtml(p.id)}">
            <span class="search-result-name">${escapeHtml(p.name)}</span>
            <span class="search-result-meta">${escapeHtml(p.location || '')}</span>
          </button>`,
      )
      .join('');

    resultsEl.querySelectorAll('.search-result').forEach((btn) => {
      btn.addEventListener('click', () => {
        closeSearch();
        openPanel(btn.dataset.id);
      });
    });
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
      tooltip.textContent = partner.name;
      tooltip.style.left = `${x}px`;
      tooltip.style.top = `${y}px`;
      tooltip.classList.add('visible');
    } else {
      tooltip.classList.remove('visible');
    }
  }

  populateTypeSelect(document.getElementById('form-type'));

  document.getElementById('btn-settings').addEventListener('click', openSettings);
  document.getElementById('btn-search').addEventListener('click', openSearch);
  document.getElementById('btn-add-partner').addEventListener('click', () => openForm());
  document.getElementById('search-input').addEventListener('input', (e) => renderSearchResults(e.target.value));
  document.querySelectorAll('.search-modal-close').forEach((el) => el.addEventListener('click', closeSearch));

  document.getElementById('panel-close').addEventListener('click', closePanel);
  document.getElementById('panel-overlay').addEventListener('click', closePanel);

  document.querySelectorAll('.form-modal-close').forEach((el) => el.addEventListener('click', closeForm));
  document.getElementById('partner-form').addEventListener('submit', saveForm);
  document.getElementById('form-geocode').addEventListener('click', runGeocode);
  document.getElementById('form-location').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      runGeocode();
    }
  });

  document.querySelectorAll('.settings-modal-close').forEach((el) => el.addEventListener('click', closeSettings));

  document.getElementById('btn-reset-data').addEventListener('click', () => {
    showConfirm('Reset all custom partner data and restore the original sample set?', () => {
      handlers.onResetData();
      closePanel();
      closeSettings();
    });
  });

  document.getElementById('confirm-cancel').addEventListener('click', closeConfirm);
  document.getElementById('confirm-ok').addEventListener('click', () => {
    confirmCallback?.();
    closeConfirm();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closePanel();
      closeForm();
      closeSettings();
      closeSearch();
      closeConfirm();
    }
  });

  return {
    openPanel,
    openForm,
    handleHover,
    updateSettingsStatus,
    renderSearchResults,
  };
}
