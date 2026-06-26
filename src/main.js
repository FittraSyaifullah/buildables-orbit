import './styles.css';
import { mergePartners, persistPartner, deletePartner, resetAllData, generateId } from './partners.js';
import { initMap, rebuildPins } from './map.js';
import { buildLegend, createUI } from './ui.js';
import { fetchAppConfig, getMapboxToken } from './config.js';
import { reverseGeocode } from './geocode.js';

let partners = [];

function refreshPartners() {
  partners = mergePartners();
  rebuildPins(partners);
}

const ui = createUI({
  getPartners: () => partners,
  generateId,
  onSavePartner: (partner, isNew) => {
    persistPartner(partner, isNew);
    refreshPartners();
  },
  onDeletePartner: (id) => {
    deletePartner(id);
    refreshPartners();
  },
  onResetData: () => {
    resetAllData();
    refreshPartners();
  },
});

buildLegend();
partners = mergePartners();

async function bootstrap() {
  await fetchAppConfig();
  ui.updateSettingsStatus();

  initMap(getMapboxToken(), {
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

  rebuildPins(partners);
}

bootstrap();
