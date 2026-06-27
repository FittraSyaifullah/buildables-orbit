import './styles.css';
import 'mapbox-gl/dist/mapbox-gl.css';
import {
  mergePartners,
  persistPartner,
  deletePartner,
  resetAllData,
  exportPartnerData,
  importPartners,
  generateId,
} from './partners.js';
import { initMap, rebuildPins, setSelectedPartner, resetGlobeView } from './map.js';
import { createUI } from './ui.js';
import { fetchAppConfig, getMapboxToken } from './config.js';
import { reverseGeocode } from './geocode.js';

let partners = [];
let typeFilter = null;
let searchQuery = '';

function partnerMatchesSearch(partner, query) {
  const q = query.toLowerCase();
  return (
    partner.name.toLowerCase().includes(q) ||
    partner.location?.toLowerCase().includes(q) ||
    partner.workingOn?.toLowerCase().includes(q) ||
    partner.companyUrl?.toLowerCase().includes(q) ||
    partner.tags?.some((t) => t.toLowerCase().includes(q))
  );
}

function getVisiblePartners() {
  let list = partners;
  if (typeFilter) list = list.filter((p) => p.type === typeFilter);
  if (searchQuery.trim()) list = list.filter((p) => partnerMatchesSearch(p, searchQuery.trim()));
  return list;
}

function refreshPartners() {
  partners = mergePartners();
  rebuildPins(getVisiblePartners());
  ui.updateLegend(partners, typeFilter, searchQuery);
  ui.updatePartnerCount(getVisiblePartners().length, partners.length);
}

function isOverlayOpen() {
  return Boolean(
    document.querySelector('.modal-overlay.open') ||
    document.getElementById('detail-panel')?.classList.contains('open'),
  );
}

const ui = createUI({
  getPartners: () => partners,
  getVisiblePartners,
  generateId,
  onSavePartner: (partner, isNew) => {
    persistPartner(partner, isNew);
    refreshPartners();
  },
  onDeletePartner: (id) => {
    deletePartner(id);
    setSelectedPartner(null);
    refreshPartners();
  },
  onResetData: () => {
    resetAllData();
    typeFilter = null;
    searchQuery = '';
    setSelectedPartner(null);
    ui.setSearchQuery('');
    refreshPartners();
  },
  onTypeFilter: (type) => {
    typeFilter = type || null;
    refreshPartners();
  },
  onSearch: (query) => {
    searchQuery = query;
    refreshPartners();
  },
  onExport: () => {
    const payload = exportPartnerData();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `buildables-orbit-partners-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  },
  onImport: (file, replace) => {
    return file.text().then((text) => {
      const data = JSON.parse(text);
      const items = Array.isArray(data) ? data : data.partners;
      return importPartners(items, { replace });
    });
  },
  onImportComplete: () => {
    typeFilter = null;
    searchQuery = '';
    ui.setSearchQuery('');
    setSelectedPartner(null);
    refreshPartners();
  },
  onSelectPartner: (id) => {
    setSelectedPartner(id);
    rebuildPins(getVisiblePartners());
  },
  onDeselectPartner: () => {
    setSelectedPartner(null);
    rebuildPins(getVisiblePartners());
  },
  onResetView: resetGlobeView,
});

partners = mergePartners();

async function bootstrap() {
  await fetchAppConfig();
  ui.updateSettingsStatus();

  initMap(getMapboxToken(), {
    onMapReady: refreshPartners,
    onPinClick: (id) => ui.openPanel(id),
    onMapClick: async ({ lat, lng }) => {
      if (isOverlayOpen()) return;
      ui.openForm(null, lat, lng);
      try {
        const results = await reverseGeocode(lat, lng);
        if (results[0]) {
          document.getElementById('form-location').value = results[0].label;
        }
      } catch {
        // coords still set from map click
      }
    },
    onHoverPartner: (partner, x, y) => ui.handleHover(partner, x, y),
  });
}

bootstrap();
