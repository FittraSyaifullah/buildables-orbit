import mapboxgl from 'mapbox-gl';
import { FANOUT_RADIUS, PROXIMITY_THRESHOLD, PARTNER_TYPES } from './constants.js';

let map = null;
let mapReady = false;
let resizeObserver = null;
const markers = new Map();
let rotateTimer = null;
let userInteracting = false;
let selectedPartnerId = null;

let onPinClick = () => {};
let onMapClick = () => {};
let onHoverPartner = () => {};
let onMapReady = () => {};

function computeDisplayPositions(partnerList) {
  const positions = new Map();
  const groups = [];

  partnerList.forEach((p) => {
    let placed = false;
    for (const group of groups) {
      const ref = group[0];
      const dLat = Math.abs(p.lat - ref.lat);
      const dLng = Math.abs(p.lng - ref.lng);
      const wrappedLng = Math.min(dLng, 360 - dLng);
      if (
        dLat < PROXIMITY_THRESHOLD * (180 / Math.PI) &&
        wrappedLng < PROXIMITY_THRESHOLD * (180 / Math.PI)
      ) {
        group.push(p);
        placed = true;
        break;
      }
    }
    if (!placed) groups.push([p]);
  });

  groups.forEach((group) => {
    if (group.length === 1) {
      positions.set(group[0].id, { lat: group[0].lat, lng: group[0].lng });
    } else {
      group.forEach((p, i) => {
        const angle = (2 * Math.PI * i) / group.length;
        const offsetLat = FANOUT_RADIUS * (180 / Math.PI) * Math.cos(angle);
        const offsetLng = FANOUT_RADIUS * (180 / Math.PI) * Math.sin(angle);
        positions.set(p.id, { lat: p.lat + offsetLat, lng: p.lng + offsetLng });
      });
    }
  });

  return positions;
}

function createMarkerElement(partner, isSelected) {
  const color = PARTNER_TYPES[partner.type]?.color || '#64748b';
  const el = document.createElement('button');
  el.type = 'button';
  el.className = `map-pin${isSelected ? ' map-pin--selected' : ''}`;
  el.style.setProperty('--pin-color', color);
  el.style.backgroundColor = color;
  el.setAttribute('aria-label', `${partner.name}, ${PARTNER_TYPES[partner.type]?.label || partner.type}`);
  el.dataset.partnerId = partner.id;
  return el;
}

function showMapError(message) {
  const loading = document.getElementById('map-loading');
  if (loading) loading.remove();
  const container = document.getElementById('map-container');
  container.innerHTML = `<div class="map-error">${message}</div>`;
}

function hideMapLoading() {
  document.getElementById('map-loading')?.remove();
  document.getElementById('map-container')?.classList.add('map-container--ready');
}

function getGlobePadding() {
  const narrow = window.innerWidth < 640;
  const legend = document.getElementById('legend');
  const legendW = legend ? Math.min(legend.offsetWidth + 32, 240) : 0;

  return {
    top: narrow ? 88 : 64,
    bottom: narrow ? 56 : 48,
    left: narrow ? 12 : legendW,
    right: narrow ? 12 : 48,
  };
}

function getGlobeZoom() {
  if (!map) return 0.9;
  const { clientWidth: w, clientHeight: h } = map.getContainer();
  const minSide = Math.min(w, h);
  if (minSide < 420) return 0.65;
  if (minSide < 720) return 0.78;
  if (minSide < 1100) return 0.88;
  return 0.95;
}

function applyGlobeStyle() {
  if (!map) return;

  map.getStyle().layers.forEach((layer) => {
    if (layer.type === 'symbol') {
      try {
        map.setLayoutProperty(layer.id, 'visibility', 'none');
      } catch {
        // layer may not support visibility
      }
    }
  });

  map.setFog({
    color: 'rgb(186, 210, 235)',
    'high-color': 'rgb(36, 92, 223)',
    'horizon-blend': 0.04,
    'space-color': 'rgb(11, 11, 25)',
    'star-intensity': 0.45,
  });
}

export function frameGlobeView(animate = false) {
  if (!map || !mapReady) return;

  map.setPadding(getGlobePadding());
  map.resize();

  const view = {
    center: [0, 18],
    zoom: getGlobeZoom(),
    bearing: 0,
    pitch: 0,
  };

  if (animate) {
    map.flyTo({ ...view, speed: 1.3, essential: true });
  } else {
    map.jumpTo(view);
  }
}

function startAutoRotate() {
  if (rotateTimer) clearInterval(rotateTimer);
  rotateTimer = setInterval(() => {
    if (!userInteracting && map && mapReady) {
      map.setBearing(map.getBearing() + 0.06);
    }
  }, 50);
}

function pauseAutoRotate(ms = 3500) {
  userInteracting = true;
  setTimeout(() => {
    userInteracting = false;
  }, ms);
}

function onResize() {
  if (!map) return;
  frameGlobeView(false);
}

export function initMap(token, callbacks) {
  onPinClick = callbacks.onPinClick;
  onMapClick = callbacks.onMapClick;
  onHoverPartner = callbacks.onHoverPartner;
  onMapReady = callbacks.onMapReady || (() => {});

  if (!token) {
    showMapError('Mapbox token not configured. Add MAPBOX_ACCESS_TOKEN to .env and restart the server.');
    return null;
  }

  mapboxgl.accessToken = token;

  map = new mapboxgl.Map({
    container: 'map-container',
    style: 'mapbox://styles/mapbox/satellite-streets-v12',
    projection: 'globe',
    center: [0, 18],
    zoom: 0.9,
    bearing: 0,
    pitch: 0,
    minZoom: 0.35,
    maxZoom: 10,
    antialias: true,
  });

  map.addControl(new mapboxgl.NavigationControl({ showCompass: true }), 'bottom-right');
  map.scrollZoom.enable();
  map.dragPan.enable();
  map.dragRotate.enable();
  map.touchZoomRotate.enable();

  map.on('load', () => {
    mapReady = true;
    applyGlobeStyle();
    frameGlobeView(false);
    startAutoRotate();
    hideMapLoading();
    onMapReady();
    requestAnimationFrame(() => frameGlobeView(false));
  });

  map.on('style.load', () => {
    if (mapReady) applyGlobeStyle();
  });

  map.on('dragstart', () => { userInteracting = true; });
  map.on('zoomstart', () => { userInteracting = true; });
  map.on('rotatestart', () => { userInteracting = true; });
  map.on('dragend', () => pauseAutoRotate());
  map.on('zoomend', () => pauseAutoRotate());
  map.on('rotateend', () => pauseAutoRotate());

  map.on('click', (e) => {
    if (e.originalEvent.target.closest('.map-pin')) return;
    onMapClick({ lat: e.lngLat.lat, lng: e.lngLat.lng });
  });

  map.on('error', (e) => {
    console.error('Mapbox error:', e.error);
  });

  window.addEventListener('resize', onResize);

  const container = document.getElementById('map-container');
  if (container && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => onResize());
    resizeObserver.observe(container);
  }

  return map;
}

export function setSelectedPartner(id) {
  selectedPartnerId = id;
}

export function rebuildPins(partners) {
  if (!map || !mapReady) return;

  markers.forEach((marker) => marker.remove());
  markers.clear();

  const positions = computeDisplayPositions(partners);

  partners.forEach((partner) => {
    const pos = positions.get(partner.id) || { lat: partner.lat, lng: partner.lng };
    const isSelected = partner.id === selectedPartnerId;
    const el = createMarkerElement(partner, isSelected);

    el.addEventListener('click', (e) => {
      e.stopPropagation();
      onPinClick(partner.id);
    });

    el.addEventListener('mouseenter', (e) => {
      el.classList.add('map-pin--hover');
      onHoverPartner(partner, e.clientX, e.clientY);
    });

    el.addEventListener('mouseleave', () => {
      el.classList.remove('map-pin--hover');
      onHoverPartner(null);
    });

    const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
      .setLngLat([pos.lng, pos.lat])
      .addTo(map);

    markers.set(partner.id, marker);
  });
}

export function flyToPartner(partner) {
  if (!map || !partner) return;
  pauseAutoRotate(5000);
  map.flyTo({
    center: [partner.lng, partner.lat],
    zoom: Math.min(Math.max(map.getZoom(), 2), 3.2),
    speed: 1.1,
    essential: true,
  });
}

export function resetGlobeView() {
  if (!map) return;
  pauseAutoRotate();
  frameGlobeView(true);
}

export function getMap() {
  return map;
}
