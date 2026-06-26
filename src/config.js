let synopsisViaServer = false;
let isProductionDeploy = false;
let mapboxConfigured = false;
let mapboxToken = '';

export async function fetchAppConfig() {
  try {
    const [configRes, healthRes] = await Promise.all([
      fetch('/api/config'),
      fetch('/api/health'),
    ]);

    if (healthRes.ok) {
      const health = await healthRes.json();
      isProductionDeploy = health.env === 'production';
    }

    if (configRes.ok) {
      const data = await configRes.json();
      synopsisViaServer = Boolean(data.synopsisViaServer);
      mapboxConfigured = Boolean(data.mapboxConfigured);
      mapboxToken = data.mapboxToken || '';
    }
  } catch {
    synopsisViaServer = false;
    isProductionDeploy = false;
    mapboxConfigured = false;
    mapboxToken = '';
  }

  return { synopsisViaServer, mapboxConfigured, mapboxToken };
}

export function isSynopsisViaServer() {
  return synopsisViaServer;
}

export function isProductionEnv() {
  return isProductionDeploy;
}

export function isMapboxConfigured() {
  return mapboxConfigured;
}

export function getMapboxToken() {
  return mapboxToken;
}
