export const STORAGE_KEY = 'buildables-orbit-overrides';
export const FANOUT_RADIUS = 0.04;
export const PROXIMITY_THRESHOLD = 0.08;

/** Bottom nav → partner type filter */
export const NAV_FILTERS = {
  read: 'client',
  watch: 'vendor',
  listen: 'investor',
  play: 'tech-partner',
};

/** Fixed screen positions for floating tag pills */
export const TAG_LAYOUT = [
  { top: '26%', left: '6%' },
  { top: '18%', left: '38%' },
  { top: '24%', left: '62%' },
  { top: '34%', left: '78%' },
  { top: '42%', left: '12%' },
  { top: '48%', left: '52%' },
  { top: '38%', left: '28%' },
  { top: '52%', left: '72%' },
  { top: '30%', left: '88%' },
  { top: '44%', left: '42%' },
  { top: '56%', left: '22%' },
];

/** Decorative white dots on the globe */
export const AMBIENT_DOTS = [
  { lat: 48.85, lng: 2.35 }, { lat: 40.71, lng: -74.0 }, { lat: 35.68, lng: 139.65 },
  { lat: 51.51, lng: -0.13 }, { lat: 37.77, lng: -122.42 }, { lat: 22.54, lng: 114.06 },
  { lat: 1.35, lng: 103.82 }, { lat: -33.87, lng: 151.21 }, { lat: 52.52, lng: 13.41 },
  { lat: 59.33, lng: 18.07 }, { lat: 31.23, lng: 121.47 }, { lat: 19.08, lng: 72.88 },
  { lat: -23.55, lng: -46.63 }, { lat: 34.05, lng: -118.24 }, { lat: 41.9, lng: 12.5 },
  { lat: 55.76, lng: 37.62 }, { lat: 30.04, lng: 31.24 }, { lat: 33.87, lng: -79.04 },
  { lat: 25.2, lng: 55.27 }, { lat: -34.6, lng: -58.38 }, { lat: 13.76, lng: 100.5 },
  { lat: 28.61, lng: 77.21 }, { lat: 6.52, lng: 3.38 }, { lat: -1.29, lng: 36.82 },
  { lat: 45.42, lng: -75.7 }, { lat: 43.65, lng: -79.38 }, { lat: 50.11, lng: 8.68 },
  { lat: 60.17, lng: 24.94 }, { lat: 47.61, lng: -122.33 }, { lat: 39.9, lng: 116.4 },
  { lat: 14.6, lng: 120.98 }, { lat: -37.81, lng: 144.96 }, { lat: 64.15, lng: -21.95 },
  { lat: 53.35, lng: -6.26 }, { lat: 38.72, lng: -9.14 }, { lat: 4.71, lng: -74.07 },
  { lat: -12.05, lng: -77.04 }, { lat: 32.78, lng: -96.8 }, { lat: 42.36, lng: -71.06 },
  { lat: 49.28, lng: -123.12 }, { lat: 46.2, lng: 6.14 }, { lat: 36.2, lng: 138.25 },
];

export const PARTNER_TYPES = {
  client: { label: 'Client', color: '#2563eb' },
  investor: { label: 'Investor', color: '#059669' },
  'tech-partner': { label: 'Tech partner', color: '#7c3aed' },
  reseller: { label: 'Reseller', color: '#ea580c' },
  vendor: { label: 'Vendor', color: '#0891b2' },
};

export const SEED_PARTNERS = [
  { id: 'seed-1', name: 'Volta Dynamics', type: 'client', lat: 37.7749, lng: -122.4194, location: 'San Francisco, USA', workingOn: 'Series B EV powertrain enclosure — DFM review in progress', tags: ['EV', 'enclosures', 'aluminum'] },
  { id: 'seed-2', name: 'Nordic Forge AB', type: 'vendor', lat: 59.3293, lng: 18.0686, location: 'Stockholm, Sweden', workingOn: 'CNC machined brackets for drone frame prototype', tags: ['CNC', 'aerospace', 'prototyping'] },
  { id: 'seed-3', name: 'Horizon Capital', type: 'investor', lat: 40.7128, lng: -74.0060, location: 'New York, USA', workingOn: 'Seed extension — Q3 board prep', tags: ['Series A', 'hardware'] },
  { id: 'seed-4', name: 'Shenzhen Precision Co.', type: 'vendor', lat: 22.5431, lng: 114.0579, location: 'Shenzhen, China', workingOn: 'Injection-molded housings — tooling quote pending', tags: ['injection molding', 'consumer electronics'] },
  { id: 'seed-5', name: 'RoboCore Systems', type: 'tech-partner', lat: 48.8566, lng: 2.3522, location: 'Paris, France', workingOn: 'Joint SDK integration for actuator control stack', tags: ['robotics', 'software', 'ROS2'] },
  { id: 'seed-6', name: 'Pacific Components Ltd.', type: 'reseller', lat: 35.6762, lng: 139.6503, location: 'Tokyo, Japan', workingOn: 'Fastener and bearing distribution — annual contract renewal', tags: ['fasteners', 'bearings', 'distribution'] },
  { id: 'seed-7', name: 'Atlas Manufacturing', type: 'vendor', lat: 52.5200, lng: 13.4050, location: 'Berlin, Germany', workingOn: 'Sheet metal chassis — first article inspection scheduled', tags: ['sheet metal', 'FAI', 'ISO 9001'] },
  { id: 'seed-8', name: 'Meridian Robotics', type: 'client', lat: 51.5074, lng: -0.1278, location: 'London, UK', workingOn: 'Warehouse AMR platform — BOM cost optimization', tags: ['AMR', 'logistics', 'steel'] },
  { id: 'seed-9', name: 'Southern Cross Fab', type: 'vendor', lat: -33.8688, lng: 151.2093, location: 'Sydney, Australia', workingOn: 'Laser-cut panel sets for solar mounting system', tags: ['laser cutting', 'solar', 'sheet metal'] },
  { id: 'seed-10', name: 'InnovaTech Ventures', type: 'investor', lat: 1.3521, lng: 103.8198, location: 'Singapore', workingOn: 'Portfolio intro to SEA contract manufacturers', tags: ['SEA', 'intro', 'portfolio'] },
];
