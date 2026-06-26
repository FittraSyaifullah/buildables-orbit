import { createApp } from './app.js';

const PORT = Number(process.env.PORT) || 3001;
const isProd = process.env.NODE_ENV === 'production';

if (process.env.VERCEL) {
  console.error('Use api/index.js on Vercel — not server/index.js');
  process.exit(1);
}

const app = createApp();

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Buildables Orbit → http://0.0.0.0:${PORT} (${isProd ? 'production' : 'development'})`);
  if (process.env.MAPBOX_ACCESS_TOKEN) {
    console.log('Mapbox: configured');
  } else {
    console.log('Mapbox: add MAPBOX_ACCESS_TOKEN to .env');
  }
  if (process.env.EXA_API_KEY && process.env.MISTRAL_API_KEY) {
    console.log('Synopsis: server keys configured');
  } else if (isProd) {
    console.log('Synopsis: EXA_API_KEY + MISTRAL_API_KEY not set — feature disabled until configured');
  } else {
    console.log('Synopsis: add keys to .env or use Settings in the app');
  }
});
