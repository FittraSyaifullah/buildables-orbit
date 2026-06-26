export const STORAGE_KEY = 'buildables-orbit-overrides';
export const FANOUT_RADIUS = 0.04;
export const PROXIMITY_THRESHOLD = 0.08;

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
