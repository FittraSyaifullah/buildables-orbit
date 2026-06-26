import mapboxgl from 'mapbox-gl';
import { FANOUT_RADIUS, PROXIMITY_THRESHOLD, PARTNER_TYPES } from './constants.js';

const DEFAULT_VIEW = { center: [20, 20], zoom: 1.05, bearing: 0, pitch: 0 };

let map = null;
let mapReady = false;
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

function applyGlobePadding() {
  if (!map) return;
  const narrow = window.innerWidth < 640;
  map.setPadding({
    top: narrow ? 96 : 72,
    bottom: narrow ? 140 : 96,
    left: narrow ? 16 : 220,
    right: narrow ? 16 : 24,
  });
}

function applyGlobeStyle() {
  if (!map) return;

  map.getStyle().layers.forEach((layer) => {
    if (layer.type === 'symbol') {
      map.setLayoutProperty(layer.id, 'visibility', 'none');
    }
    if (layer.type === 'background') {
      map.setPaintProperty(layer.id, 'background-color', '#dce3ed');
    }
    if (layer.type === 'fill') {
      const id = layer.id.toLowerCase();
      if (id.includes('water')) {
        map.setPaintProperty(layer.id, 'fill-color', '#eef2f7');
      } else if (id.includes('land') || id.includes('country') || id.includes('admin')) {
        map.setPaintProperty(layer.id, 'fill-color', '#8b9cb3');
        map.setPaintProperty(layer.id, 'fill-opacity', 1);
      }
    }
    if (layer.type === 'line') {
      map.setPaintProperty(layer.id, 'line-color', '#64748b');
      map.setPaintProperty(layer.id, 'line-opacity', 0.5);
    }
  });

  map.setFog({
    color: 'rgb(220, 227, 237)',
    'high-color': 'rgb(238, 242, 247)',
    'horizon-blend': 0.12,
    'space-color': 'rgb(220, 227, 237)',
    'star-intensity': 0,
  });
}

function startAutoRotate() {
  if (rotateTimer) clearInterval(rotateTimer);
  rotateTimer = setInterval(() => {
    if (!userInteracting && map && mapReady) {
      map.setBearing(map.getBearing() + 0.08);
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
  applyGlobePadding();
  map.resize();
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
    style: 'mapbox://styles/mapbox/light-v11',
    projection: 'globe',
    center: DEFAULT_VIEW.center,
    zoom: DEFAULT_VIEW.zoom,
    pitch: DEFAULT_VIEW.pitch,
    bearing: DEFAULT_VIEW.bearing,
    minZoom: 0.4,
    maxZoom: 8,
    antialias: true,
  });

  map.addControl(new mapboxgl.NavigationControl({ showCompass: true }), 'bottom-right');
  map.dragRotate.enable();
  map.touchZoomRotate.enableRotation();

  map.on('load', () => {
    mapReady = true;
    applyGlobeStyle();
    applyGlobePadding();
    map.resize();
    startAutoRotate();
    hideMapLoading();
    onMapReady();
    requestAnimationFrame(() => map.resize());
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
    zoom: Math.min(Math.max(map.getZoom(), 2.2), 3.5),
    speed: 1.1,
    essential: true,
  });
}

export function resetGlobeView() {
  if (!map) return;
  pauseAutoRotate();
  applyGlobePadding();
  map.flyTo({
    center: DEFAULT_VIEW.center,
    zoom: DEFAULT_VIEW.zoom,
    bearing: DEFAULT_VIEW.bearing,
    pitch: DEFAULT_VIEW.pitch,
    speed: 1.4,
    essential: true,
  });
}

export function getMap() {
  return map;
}
