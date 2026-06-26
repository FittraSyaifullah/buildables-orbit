import './styles.css';
import 'mapbox-gl/dist/mapbox-gl.css';
import { mergePartners, persistPartner, deletePartner, resetAllData, generateId } from './partners.js';
import { initMap, rebuildPins, setSelectedPartner, resetGlobeView } from './map.js';
import { buildLegend, createUI } from './ui.js';
import { fetchAppConfig, getMapboxToken } from './config.js';
import { reverseGeocode } from './geocode.js';

let partners = [];
let typeFilter = null;

function getVisiblePartners() {
  if (!typeFilter) return partners;
  return partners.filter((p) => p.type === typeFilter);
}

function refreshPartners() {
  partners = mergePartners();
  rebuildPins(getVisiblePartners());
  ui.updateLegend(partners, typeFilter);
  ui.updatePartnerCount(getVisiblePartners().length, partners.length);
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
    setSelectedPartner(null);
    refreshPartners();
  },
  onTypeFilter: (type) => {
    typeFilter = typeFilter === type ? null : type;
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
