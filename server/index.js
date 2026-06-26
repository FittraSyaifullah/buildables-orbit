import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3001;
const isProd = process.env.NODE_ENV === 'production';
const distPath = path.join(__dirname, '..', 'dist');

const app = express();

if (isProd) {
  app.set('trust proxy', 1);
}

app.use(express.json({ limit: '32kb' }));

app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    env: isProd ? 'production' : 'development',
    synopsisConfigured: Boolean(process.env.EXA_API_KEY && process.env.MISTRAL_API_KEY),
    mapboxConfigured: Boolean(process.env.MAPBOX_ACCESS_TOKEN),
    frontendBuilt: existsSync(path.join(distPath, 'index.html')),
  });
});

app.get('/api/config', (_req, res) => {
  res.json({
    synopsisViaServer: Boolean(process.env.EXA_API_KEY && process.env.MISTRAL_API_KEY),
    mapboxConfigured: Boolean(process.env.MAPBOX_ACCESS_TOKEN),
    mapboxToken: process.env.MAPBOX_ACCESS_TOKEN || '',
  });
});

app.get('/api/geocode', async (req, res) => {
  const token = process.env.MAPBOX_ACCESS_TOKEN;
  if (!token) {
    return res.status(503).json({ error: 'Mapbox is not configured. Add MAPBOX_ACCESS_TOKEN to .env.' });
  }

  const { q, lat, lng } = req.query;

  try {
    let url;
    if (q) {
      url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(String(q))}.json?access_token=${token}&limit=5&types=place,locality,region,country,address,poi`;
    } else if (lat && lng) {
      url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${token}&limit=1`;
    } else {
      return res.status(400).json({ error: 'Provide q or lat/lng query parameters.' });
    }

    const geoRes = await fetch(url);
    if (!geoRes.ok) {
      const err = await geoRes.text();
      return res.status(geoRes.status).json({ error: `Mapbox geocoding failed: ${err.slice(0, 200)}` });
    }

    const geoData = await geoRes.json();
    const results = (geoData.features || []).map((f) => ({
      label: f.place_name,
      lat: f.center[1],
      lng: f.center[0],
    }));

    res.json({ results });
  } catch (err) {
    console.error('Geocode error:', err);
    res.status(500).json({ error: err.message || 'Geocoding failed.' });
  }
});

const PARTNER_TYPE_LABELS = {
  client: 'Client',
  investor: 'Investor',
  'tech-partner': 'Tech partner',
  reseller: 'Reseller',
  vendor: 'Vendor',
};

function buildPartnerContext({ type, workingOn, tags }) {
  const lines = [];
  if (type) lines.push(`Relationship: ${PARTNER_TYPE_LABELS[type] || type}`);
  if (workingOn?.trim()) lines.push(`What we're working on together: ${workingOn.trim()}`);
  if (Array.isArray(tags) && tags.length) lines.push(`Tags: ${tags.join(', ')}`);
  return lines.length ? lines.join('\n') : '';
}

app.post('/api/synopsis', async (req, res) => {
  const { name, location, type, workingOn, tags, exaKey, mistralKey } = req.body ?? {};
  const exa = process.env.EXA_API_KEY || (!isProd ? exaKey : undefined);
  const mistral = process.env.MISTRAL_API_KEY || (!isProd ? mistralKey : undefined);

  if (!name?.trim()) {
    return res.status(400).json({ error: 'Partner name is required.' });
  }
  if (!exa || !mistral) {
    return res.status(503).json({
      error: isProd
        ? 'Synopsis is not configured on the server. Contact the site administrator.'
        : 'Synopsis API keys not configured. Add EXA_API_KEY and MISTRAL_API_KEY to .env, or enter keys in Settings.',
    });
  }

  const partnerContext = buildPartnerContext({ type, workingOn, tags });

  try {
    const query = `${name} ${location || ''} company`.trim();
    const searchRes = await fetch('https://api.exa.ai/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': exa,
      },
      body: JSON.stringify({
        query,
        numResults: 3,
        type: 'auto',
        contents: { text: { maxCharacters: 1000 } },
      }),
    });

    if (!searchRes.ok) {
      const err = await searchRes.text();
      return res.status(searchRes.status).json({
        error: `Exa search failed (${searchRes.status}): ${err.slice(0, 200)}`,
      });
    }

    const searchData = await searchRes.json();
    const results = searchData.results || [];

    if (results.length === 0 && !partnerContext) {
      return res.json({
        error: 'No web results found for this partner. Add working-on details or check the name/location.',
      });
    }

    const webContext = results.length
      ? results
          .map((r) => `Title: ${r.title || 'N/A'}\nURL: ${r.url || 'N/A'}\n${r.text || ''}`)
          .join('\n\n---\n\n')
      : '';
    const sourceUrl = results[0]?.url || '';

    const userContent = [
      `Write a brief synopsis for "${name}" (${location || 'unknown location'}).`,
      partnerContext ? `\nInternal team context (use alongside web results):\n${partnerContext}` : '',
      webContext ? `\nWeb search results:\n${webContext}` : '\nNo web results found — summarize from internal context only.',
    ].join('');

    const mistralRes = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${mistral}`,
      },
      body: JSON.stringify({
        model: 'mistral-small-latest',
        messages: [
          {
            role: 'system',
            content:
              'You write brief, factual partner synopses in 2-4 sentences. Combine public company facts from web results with internal partnership context when provided. Only state facts supported by the inputs. No marketing language.',
          },
          { role: 'user', content: userContent },
        ],
        max_tokens: 250,
        temperature: 0.3,
      }),
    });

    if (!mistralRes.ok) {
      const err = await mistralRes.text();
      return res.status(mistralRes.status).json({
        error: `Mistral summarization failed (${mistralRes.status}): ${err.slice(0, 200)}`,
      });
    }

    const mistralData = await mistralRes.json();
    const text = mistralData.choices?.[0]?.message?.content?.trim();

    if (!text) {
      return res.status(502).json({ error: 'Mistral returned an empty summary.' });
    }

    res.json({ text, source: sourceUrl });
  } catch (err) {
    console.error('Synopsis error:', err);
    res.status(500).json({
      error: err.message || 'Synopsis generation failed.',
    });
  }
});

if (isProd) {
  if (!existsSync(path.join(distPath, 'index.html'))) {
    console.error('Production start requires dist/. Run: npm run build');
    process.exit(1);
  }

  app.use(express.static(distPath, { maxAge: '1d', index: false }));

  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

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