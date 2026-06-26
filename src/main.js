import './styles.css';
import 'mapbox-gl/dist/mapbox-gl.css';
import { mergePartners, persistPartner, deletePartner, resetAllData, generateId } from './partners.js';
import { initMap, rebuildPins, setMapFilter, setMapSelection, flyToPartner } from './map.js';
import { buildFloatingTags, createUI } from './ui.js';
import { fetchAppConfig, getMapboxToken } from './config.js';
import { reverseGeocode } from './geocode.js';
import { NAV_FILTERS } from './constants.js';

let partners = [];
let activeNav = 'all';
let activeTag = null;

function refreshPartners() {
  partners = mergePartners();
  rebuildPins(partners, filterPartners(partners));
  buildFloatingTags(partners, activeTag, (tag) => {
    activeTag = activeTag === tag ? null : tag;
    refreshPartners();
    ui.renderSearchResults(document.getElementById('search-input')?.value || '');
  });
}

const ui = createUI({
  getPartners: () => partners,
  getFilteredPartners: () => filterPartners(partners),
  generateId,
  onSavePartner: (partner, isNew) => {
    persistPartner(partner, isNew);
    refreshPartners();
  },
  onDeletePartner: (id) => {
    deletePartner(id);
    setMapSelection(null, partners);
    refreshPartners();
  },
  onResetData: () => {
    resetAllData();
    activeTag = null;
    setMapSelection(null, partners);
    refreshPartners();
  },
  onPartnerSelect: (id) => {
    setMapSelection(id, partners);
    rebuildPins(partners, filterPartners(partners));
  },
  onPartnerDeselect: () => {
    setMapSelection(null, partners);
    rebuildPins(partners, filterPartners(partners));
  },
  flyToPartner,
});

function filterPartners(list) {
  let filtered = list;
  if (activeNav !== 'all') {
    const type = NAV_FILTERS[activeNav];
    if (type) filtered = filtered.filter((p) => p.type === type);
  }
  if (activeTag) {
    filtered = filtered.filter((p) => p.tags?.some((t) => t.toLowerCase() === activeTag.toLowerCase()));
  }
  return filtered;
}

function applyNavFilter(nav) {
  if (activeNav === nav) {
    activeNav = 'all';
    document.querySelectorAll('.orbit-nav-item').forEach((btn) => {
      btn.classList.remove('orbit-nav-item--active');
    });
    setMapFilter('all');
  } else {
    activeNav = nav;
    document.querySelectorAll('.orbit-nav-item').forEach((btn) => {
      btn.classList.toggle('orbit-nav-item--active', btn.dataset.nav === nav);
    });
    setMapFilter(NAV_FILTERS[nav] || 'all');
  }
  rebuildPins(partners, filterPartners(partners));
}

document.querySelectorAll('.orbit-nav-item').forEach((btn) => {
  btn.addEventListener('click', () => applyNavFilter(btn.dataset.nav));
});

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

  refreshPartners();
}

bootstrap();
