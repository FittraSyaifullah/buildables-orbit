import mapboxgl from 'mapbox-gl';
import { FANOUT_RADIUS, PROXIMITY_THRESHOLD, PARTNER_TYPES } from './constants.js';

let map = null;
let mapReady = false;
const markers = new Map();
let rotateTimer = null;
let userInteracting = false;

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

function createMarkerElement(partner) {
  const color = PARTNER_TYPES[partner.type]?.color || '#64748b';
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'map-pin';
  el.style.backgroundColor = color;
  el.setAttribute('aria-label', partner.name);
  return el;
}

function showMapError(message) {
  const container = document.getElementById('map-container');
  container.innerHTML = `<div class="map-error">${message}</div>`;
}

function startAutoRotate() {
  if (rotateTimer) clearInterval(rotateTimer);
  rotateTimer = setInterval(() => {
    if (!userInteracting && map && mapReady) {
      map.setBearing(map.getBearing() + 0.12);
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
    style: 'mapbox://styles/mapbox/satellite-streets-v12',
    projection: 'globe',
    center: [10, 25],
    zoom: 1.4,
    pitch: 0,
    bearing: 0,
    antialias: true,
  });

  map.addControl(new mapboxgl.NavigationControl({ showCompass: true }), 'top-right');

  map.on('load', () => {
    mapReady = true;
    map.setFog({
      color: 'rgb(186, 210, 235)',
      'high-color': 'rgb(36, 92, 223)',
      'horizon-blend': 0.02,
      'space-color': 'rgb(11, 11, 25)',
      'star-intensity': 0.6,
    });
    startAutoRotate();
  });

  map.on('dragstart', () => {
    userInteracting = true;
  });
  map.on('zoomstart', () => {
    userInteracting = true;
  });
  map.on('rotatestart', () => {
    userInteracting = true;
  });
  map.on('dragend', () => {
    setTimeout(() => {
      userInteracting = false;
    }, 3000);
  });
  map.on('zoomend', () => {
    setTimeout(() => {
      userInteracting = false;
    }, 3000);
  });
  map.on('rotateend', () => {
    setTimeout(() => {
      userInteracting = false;
    }, 3000);
  });

  map.on('click', (e) => {
    if (e.originalEvent.target.closest('.map-pin')) return;
    onMapClick({ lat: e.lngLat.lat, lng: e.lngLat.lng });
  });

  map.on('error', (e) => {
    console.error('Mapbox error:', e.error);
  });

  return map;
}

export function rebuildPins(partners) {
  if (!map) return;

  markers.forEach((marker) => marker.remove());
  markers.clear();

  const positions = computeDisplayPositions(partners);

  partners.forEach((partner) => {
    const pos = positions.get(partner.id) || { lat: partner.lat, lng: partner.lng };
    const el = createMarkerElement(partner);

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
  map.flyTo({
    center: [partner.lng, partner.lat],
    zoom: Math.max(map.getZoom(), 4),
    speed: 1.2,
    essential: true,
  });
}

export function getMap() {
  return map;
}
