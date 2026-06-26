import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { FANOUT_RADIUS, PROXIMITY_THRESHOLD, PARTNER_TYPES } from './constants.js';

const GLOBE_RADIUS = 1;
const LAND_MASK_URL = 'https://cdn.jsdelivr.net/npm/three-globe@2.42.2/example/img/earth-topology.png';
const DOT_STEP = 3;
const LAND_THRESHOLD = 100;

let scene = null;
let camera = null;
let renderer = null;
let controls = null;
let globeGroup = null;
let pinLayer = null;
let canvas = null;
let animationId = null;
let globeReady = false;
let userInteracting = false;
let resumeRotateTimer = null;

const pinElements = new Map();
const pinWorldPositions = new Map();

let onPinClick = () => {};
let onMapClick = () => {};
let onHoverPartner = () => {};

function latLngToVector3(lat, lng, radius = GLOBE_RADIUS) {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lng + 180) * Math.PI) / 180;
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

function vector3ToLatLng(vec) {
  const n = vec.clone().normalize();
  const lat = 90 - (Math.acos(Math.min(1, Math.max(-1, n.y))) * 180) / Math.PI;
  const lng = (Math.atan2(n.z, -n.x) * 180) / Math.PI - 180;
  return { lat, lng };
}

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
  const typeColor = PARTNER_TYPES[partner.type]?.color || '#f5a623';
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'map-pin';
  el.style.setProperty('--pin-accent', typeColor);
  el.setAttribute('aria-label', partner.name);
  el.dataset.partnerId = partner.id;
  return el;
}

function showMapError(message) {
  const container = document.getElementById('map-container');
  container.innerHTML = `<div class="map-error">${message}</div>`;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function buildDotGlobe(group) {
  const img = await loadImage(LAND_MASK_URL);
  const w = img.width;
  const h = img.height;

  const offscreen = document.createElement('canvas');
  offscreen.width = w;
  offscreen.height = h;
  const ctx = offscreen.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const { data } = ctx.getImageData(0, 0, w, h);

  const vertices = [];
  for (let y = 0; y < h; y += DOT_STEP) {
    for (let x = 0; x < w; x += DOT_STEP) {
      const i = (y * w + x) * 4;
      const brightness = data[i];
      if (brightness >= LAND_THRESHOLD) continue;

      const lng = (x / w) * 360 - 180;
      const lat = 90 - (y / h) * 180;
      const pos = latLngToVector3(lat, lng, GLOBE_RADIUS * 1.002);
      vertices.push(pos.x, pos.y, pos.z);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));

  const material = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.012,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
  });

  group.add(new THREE.Points(geometry, material));

  const core = new THREE.Mesh(
    new THREE.SphereGeometry(GLOBE_RADIUS * 0.996, 48, 48),
    new THREE.MeshBasicMaterial({ color: 0x030303 }),
  );
  group.add(core);
}

function createAtmosphereMesh() {
  const geometry = new THREE.SphereGeometry(GLOBE_RADIUS * 1.06, 64, 64);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      glowColor: { value: new THREE.Color(0xffffff) },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewPosition = -mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 glowColor;
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      void main() {
        vec3 viewDir = normalize(vViewPosition);
        float rim = 1.0 - max(dot(viewDir, vNormal), 0.0);
        rim = pow(rim, 2.6);
        float top = smoothstep(-0.1, 0.88, vNormal.y);
        float alpha = rim * top * 0.62;
        gl_FragColor = vec4(glowColor, alpha);
      }
    `,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });

  return new THREE.Mesh(geometry, material);
}

function createStarfield() {
  const count = 2400;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    const r = 40 + Math.random() * 30;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.08,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });

  return new THREE.Points(geometry, material);
}

function updatePinPositions() {
  if (!camera || !globeGroup || !pinLayer) return;

  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const cameraDir = new THREE.Vector3();
  camera.getWorldDirection(cameraDir);

  pinElements.forEach((el, id) => {
    const worldPos = pinWorldPositions.get(id);
    if (!worldPos) return;

    const projected = worldPos.clone();
    globeGroup.localToWorld(projected);

    const toPin = projected.clone().sub(camera.position).normalize();
    const facing = cameraDir.dot(toPin) > 0.15;

    const ndc = projected.clone().project(camera);
    const x = (ndc.x * 0.5 + 0.5) * width;
    const y = (-ndc.y * 0.5 + 0.5) * height;
    const behind = ndc.z > 1;

    if (!facing || behind) {
      el.style.opacity = '0';
      el.style.pointerEvents = 'none';
      return;
    }

    el.style.opacity = '1';
    el.style.pointerEvents = 'auto';
    el.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px)`;
    el.style.zIndex = String(Math.round((1 - ndc.z) * 1000));
  });
}

function onResize() {
  if (!camera || !renderer || !canvas) return;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
  updatePinPositions();
}

function animate() {
  animationId = requestAnimationFrame(animate);

  if (controls && !userInteracting) {
    globeGroup.rotation.y += 0.0009;
  }

  controls?.update();
  renderer.render(scene, camera);
  updatePinPositions();
}

function scheduleResumeRotate() {
  if (resumeRotateTimer) clearTimeout(resumeRotateTimer);
  resumeRotateTimer = setTimeout(() => {
    userInteracting = false;
  }, 3500);
}

function pickLatLng(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const mouse = new THREE.Vector2(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1,
  );

  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(mouse, camera);

  const pickMesh = globeGroup.userData.pickMesh;
  const hits = raycaster.intersectObject(pickMesh, false);
  if (!hits.length) return null;

  const local = hits[0].point.clone();
  globeGroup.worldToLocal(local);
  return vector3ToLatLng(local);
}

export function initMap(_token, callbacks) {
  onPinClick = callbacks.onPinClick;
  onMapClick = callbacks.onMapClick;
  onHoverPartner = callbacks.onHoverPartner;

  const container = document.getElementById('map-container');
  container.innerHTML = '';
  container.classList.add('map-container--globe');

  canvas = document.createElement('canvas');
  canvas.className = 'globe-canvas';
  canvas.setAttribute('aria-label', 'Interactive partner globe');

  pinLayer = document.createElement('div');
  pinLayer.className = 'map-pins';
  pinLayer.id = 'map-pins';

  container.appendChild(canvas);
  container.appendChild(pinLayer);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
  camera.position.set(0, 0.35, 2.65);

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 1);

  globeGroup = new THREE.Group();
  scene.add(globeGroup);
  scene.add(createStarfield());

  const pickMesh = new THREE.Mesh(
    new THREE.SphereGeometry(GLOBE_RADIUS, 72, 72),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  globeGroup.add(pickMesh);
  globeGroup.userData.pickMesh = pickMesh;

  controls = new OrbitControls(camera, canvas);
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 1.6;
  controls.maxDistance = 4.5;
  controls.rotateSpeed = 0.45;
  controls.zoomSpeed = 0.7;
  controls.target.set(0, 0, 0);

  controls.addEventListener('start', () => {
    userInteracting = true;
    if (resumeRotateTimer) clearTimeout(resumeRotateTimer);
  });
  controls.addEventListener('end', scheduleResumeRotate);

  canvas.addEventListener('click', (e) => {
    const picked = pickLatLng(e.clientX, e.clientY);
    if (picked) onMapClick(picked);
  });

  window.addEventListener('resize', onResize);
  onResize();
  animate();

  buildDotGlobe(globeGroup)
    .then(() => {
      globeGroup.add(createAtmosphereMesh());
      globeReady = true;
      container.classList.add('map-container--ready');
    })
    .catch((err) => {
      console.error('Globe load error:', err);
      showMapError('Could not load globe texture. Check your network connection and refresh.');
    });

  return { canvas, scene, camera };
}

export function rebuildPins(partners) {
  if (!pinLayer) return;

  pinElements.forEach((el) => el.remove());
  pinElements.clear();
  pinWorldPositions.clear();

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

    pinLayer.appendChild(el);
    pinElements.set(partner.id, el);
    pinWorldPositions.set(partner.id, latLngToVector3(pos.lat, pos.lng, GLOBE_RADIUS * 1.015));
  });

  updatePinPositions();
}

export function flyToPartner(partner) {
  if (!partner || !camera || !controls || !globeGroup) return;

  userInteracting = true;
  if (resumeRotateTimer) clearTimeout(resumeRotateTimer);

  const target = latLngToVector3(partner.lat, partner.lng, 1);
  const offset = target.clone().normalize().multiplyScalar(2.2);
  const startPos = camera.position.clone();
  const startTarget = controls.target.clone();
  const endTarget = new THREE.Vector3(0, 0, 0);
  const duration = 900;
  const start = performance.now();

  function tick(now) {
    const t = Math.min((now - start) / duration, 1);
    const ease = 1 - (1 - t) ** 3;
    camera.position.lerpVectors(startPos, offset, ease);
    controls.target.lerpVectors(startTarget, endTarget, ease);
    controls.update();
    if (t < 1) requestAnimationFrame(tick);
    else scheduleResumeRotate();
  }

  requestAnimationFrame(tick);
}

export function getMap() {
  return { scene, camera, canvas, ready: globeReady };
}

export function disposeMap() {
  if (animationId) cancelAnimationFrame(animationId);
  window.removeEventListener('resize', onResize);
  renderer?.dispose();
}
