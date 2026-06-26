import mapboxgl from 'mapbox-gl';
import { FANOUT_RADIUS, PROXIMITY_THRESHOLD, AMBIENT_DOTS } from './constants.js';

let map = null;
let mapReady = false;
const markers = new Map();
let rotateTimer = null;
let userInteracting = false;
let activeFilter = 'all';
let selectedPartnerId = null;
let linkPartnerId = null;

let onPinClick = () => {};
let onMapClick = () => {};
let onHoverPartner = () => {};

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
  const el = document.createElement('button');
  el.type = 'button';
  el.className = `orbit-marker${isSelected ? ' orbit-marker--active' : ''}`;
  el.setAttribute('aria-label', partner.name);
  return el;
}

function showMapError(message) {
  const container = document.getElementById('map-container');
  container.innerHTML = `<div class="map-error">${message}</div>`;
}

function applyMonochromeStyle() {
  if (!map) return;

  map.getStyle().layers.forEach((layer) => {
    if (layer.type === 'symbol') {
      map.setLayoutProperty(layer.id, 'visibility', 'none');
    }
    if (layer.type === 'background') {
      map.setPaintProperty(layer.id, 'background-color', '#e3e3e6');
    }
    if (layer.type === 'fill') {
      const id = layer.id.toLowerCase();
      if (id.includes('water')) {
        map.setPaintProperty(layer.id, 'fill-color', '#efeff2');
      } else if (id.includes('land') || id.includes('country') || id.includes('admin')) {
        map.setPaintProperty(layer.id, 'fill-color', '#c4c4c8');
        map.setPaintProperty(layer.id, 'fill-opacity', 0.95);
      }
    }
    if (layer.type === 'line') {
      map.setPaintProperty(layer.id, 'line-color', '#b8b8bc');
      map.setPaintProperty(layer.id, 'line-opacity', 0.45);
    }
  });

  map.setFog({
    color: '#e3e3e6',
    'high-color': '#ececef',
    'horizon-blend': 0.06,
    'space-color': '#e3e3e6',
    'star-intensity': 0,
  });
}

function buildDotsGeoJSON(partners) {
  const partnerDots = partners.map((p) => ({
    type: 'Feature',
    properties: { kind: 'partner' },
    geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
  }));

  const ambient = AMBIENT_DOTS.map((d, i) => ({
    type: 'Feature',
    properties: { kind: 'ambient', id: i },
    geometry: { type: 'Point', coordinates: [d.lng, d.lat] },
  }));

  return { type: 'FeatureCollection', features: [...ambient, ...partnerDots] };
}

function updatePartnerLink(partners) {
  if (!mapReady || !map.getSource('partner-link')) return;

  const from = partners.find((p) => p.id === selectedPartnerId);
  const to = partners.find((p) => p.id === linkPartnerId);

  if (!from || !to || from.id === to.id) {
    map.getSource('partner-link').setData({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [] },
    });
    return;
  }

  map.getSource('partner-link').setData({
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: [
        [from.lng, from.lat],
        [to.lng, to.lat],
      ],
    },
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

export function initMap(token, callbacks) {
  onPinClick = callbacks.onPinClick;
  onMapClick = callbacks.onMapClick;
  onHoverPartner = callbacks.onHoverPartner;

  if (!token) {
    showMapError('Mapbox token not configured. Add MAPBOX_ACCESS_TOKEN to .env and restart the server.');
    return null;
  }

  mapboxgl.accessToken = token;

  map = new mapboxgl.Map({
    container: 'map-container',
    style: 'mapbox://styles/mapbox/light-v11',
    projection: 'globe',
    center: [20, 28],
    zoom: 1.35,
    pitch: 0,
    bearing: 0,
    antialias: true,
    attributionControl: false,
  });

  map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-left');

  map.on('load', () => {
    mapReady = true;
    applyMonochromeStyle();

    map.addSource('ambient-dots', {
      type: 'geojson',
      data: buildDotsGeoJSON([]),
    });

    map.addLayer({
      id: 'ambient-dots',
      type: 'circle',
      source: 'ambient-dots',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 0.5, 2.5, 3, 4],
        'circle-color': '#ffffff',
        'circle-opacity': 0.95,
        'circle-stroke-width': 0,
      },
    });

    map.addSource('partner-link', {
      type: 'geojson',
      data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] } },
    });

    map.addLayer({
      id: 'partner-link',
      type: 'line',
      source: 'partner-link',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#f5c400',
        'line-width': 2,
        'line-dasharray': [1.5, 1.5],
        'line-opacity': 0.9,
      },
    });

    startAutoRotate();
  });

  map.on('dragstart', () => { userInteracting = true; });
  map.on('zoomstart', () => { userInteracting = true; });
  map.on('rotatestart', () => { userInteracting = true; });
  map.on('dragend', () => { setTimeout(() => { userInteracting = false; }, 3000); });
  map.on('zoomend', () => { setTimeout(() => { userInteracting = false; }, 3000); });
  map.on('rotateend', () => { setTimeout(() => { userInteracting = false; }, 3000); });

  map.on('click', (e) => {
    if (e.originalEvent.target.closest('.orbit-marker')) return;
    onMapClick({ lat: e.lngLat.lat, lng: e.lngLat.lng });
  });

  map.on('error', (e) => {
    console.error('Mapbox error:', e.error);
  });

  return map;
}

function partnerMatchesFilter(partner) {
  if (activeFilter === 'all') return true;
  return partner.type === activeFilter;
}

export function setMapFilter(filterType) {
  activeFilter = filterType;
}

export function setMapSelection(partnerId, partners) {
  if (partnerId && partnerId !== selectedPartnerId) {
    linkPartnerId = selectedPartnerId;
    selectedPartnerId = partnerId;
  } else if (!partnerId) {
    linkPartnerId = null;
    selectedPartnerId = null;
  }
  updatePartnerLink(partners);
}

export function rebuildPins(allPartners, markerPartners = null) {
  if (!map) return;

  if (mapReady && map.getSource('ambient-dots')) {
    map.getSource('ambient-dots').setData(buildDotsGeoJSON(allPartners));
  }

  markers.forEach((marker) => marker.remove());
  markers.clear();

  const positions = computeDisplayPositions(allPartners);
  const toMark = (markerPartners || allPartners).filter(partnerMatchesFilter);

  toMark.forEach((partner) => {
    const pos = positions.get(partner.id) || { lat: partner.lat, lng: partner.lng };
    const el = createMarkerElement(partner, partner.id === selectedPartnerId);

    el.addEventListener('click', (e) => {
      e.stopPropagation();
      onPinClick(partner.id);
    });

    el.addEventListener('mouseenter', (e) => {
      el.classList.add('orbit-marker--hover');
      onHoverPartner(partner, e.clientX, e.clientY);
    });

    el.addEventListener('mouseleave', () => {
      el.classList.remove('orbit-marker--hover');
      onHoverPartner(null);
    });

    const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
      .setLngLat([pos.lng, pos.lat])
      .addTo(map);

    markers.set(partner.id, marker);
  });

  updatePartnerLink(allPartners);
}

export function flyToPartner(partner) {
  if (!map || !partner) return;
  userInteracting = true;
  map.flyTo({
    center: [partner.lng, partner.lat],
    zoom: Math.max(map.getZoom(), 2.8),
    speed: 1.1,
    essential: true,
  });
  setTimeout(() => { userInteracting = false; }, 3500);
}

export function getMap() {
  return map;
}
