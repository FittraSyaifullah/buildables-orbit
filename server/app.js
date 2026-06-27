import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProd = process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
const isVercel = Boolean(process.env.VERCEL);
const distPath = path.join(__dirname, '..', 'dist');

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

function parseMistralJson(content) {
  const trimmed = String(content || '').trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1].trim() : trimmed;
  return JSON.parse(raw);
}

function cleanLocationQuery(value) {
  const text = String(value || '').trim();
  if (!text || /^(unknown|n\/a|not found|empty string|null|none|—|-)$/i.test(text)) return '';
  return text;
}

function parseCompanyAnalysis(content) {
  try {
    const parsed = parseMistralJson(content);
    return {
      synopsis: String(parsed.synopsis || parsed.summary || '').trim(),
      locationQuery: cleanLocationQuery(parsed.locationQuery || parsed.location || parsed.headquarters),
    };
  } catch {
    const trimmed = String(content || '').trim();
    if (!trimmed) return { synopsis: '', locationQuery: '' };
    return { synopsis: trimmed, locationQuery: '' };
  }
}

const GEOCODE_TYPE_PRIORITY = {
  address: 0,
  poi: 1,
  neighborhood: 2,
  locality: 3,
  place: 4,
  district: 5,
  region: 6,
  country: 7,
};

function pickBestGeocodeFeature(features) {
  if (!features?.length) return null;
  return [...features].sort((a, b) => {
    const rank = (feature) => {
      const type = feature.place_type?.[0] || '';
      return GEOCODE_TYPE_PRIORITY[type] ?? 99;
    };
    return rank(a) - rank(b);
  })[0];
}

async function geocodePlace(token, query) {
  if (!token || !query?.trim()) return null;

  const url =
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query.trim())}.json` +
    `?access_token=${token}&limit=5&types=place,locality,neighborhood,district,region,country,address,poi`;

  const geoRes = await fetch(url);
  if (!geoRes.ok) return null;

  const geoData = await geoRes.json();
  const feature = pickBestGeocodeFeature(geoData.features);
  if (!feature?.center) return null;

  return {
    label: feature.place_name,
    lat: feature.center[1],
    lng: feature.center[0],
  };
}

async function resolveCompanyLocation(token, { name, locationQuery, fallbackLocation }) {
  const queries = [
    locationQuery,
    fallbackLocation,
    name ? `${name} headquarters` : '',
    name ? `${name} office` : '',
    name,
  ]
    .map((q) => String(q || '').trim())
    .filter(Boolean);

  const seen = new Set();
  for (const query of queries) {
    const key = query.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const result = await geocodePlace(token, query);
    if (result) return result;
  }

  return null;
}

export function createApp() {
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
      host: isVercel ? 'vercel' : 'node',
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

  app.post('/api/synopsis', async (req, res) => {
    const { name, location, type, workingOn, tags, companyUrl, mode, exaKey, mistralKey } = req.body ?? {};
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

    const companyOnly = mode === 'company';
    const partnerContext = companyOnly ? '' : buildPartnerContext({ type, workingOn, tags });

    try {
      let webContext = '';
      let sourceUrl = '';

      if (companyUrl?.trim()) {
        let normalizedUrl;
        try {
          normalizedUrl = new URL(
            companyUrl.trim().includes('://') ? companyUrl.trim() : `https://${companyUrl.trim()}`,
          ).href;
        } catch {
          return res.status(400).json({ error: 'Enter a valid company website URL.' });
        }

        sourceUrl = normalizedUrl;

        const contentsRes = await fetch('https://api.exa.ai/contents', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': exa,
          },
          body: JSON.stringify({
            urls: [normalizedUrl],
            text: { maxCharacters: 2500 },
          }),
        });

        if (contentsRes.ok) {
          const contentsData = await contentsRes.json();
          const pages = contentsData.results || [];
          if (pages.length) {
            webContext = pages
              .map((p) => `Title: ${p.title || 'N/A'}\nURL: ${p.url || normalizedUrl}\n${p.text || ''}`)
              .join('\n\n---\n\n');
            sourceUrl = pages[0]?.url || normalizedUrl;
          }
        }

        if (!webContext) {
          const hostname = new URL(normalizedUrl).hostname.replace(/^www\./, '');
          const searchRes = await fetch('https://api.exa.ai/search', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': exa,
            },
            body: JSON.stringify({
              query: `${name} site:${hostname}`,
              numResults: 3,
              type: 'auto',
              contents: { text: { maxCharacters: 1200 } },
            }),
          });

          if (searchRes.ok) {
            const searchData = await searchRes.json();
            const results = searchData.results || [];
            if (results.length) {
              webContext = results
                .map((r) => `Title: ${r.title || 'N/A'}\nURL: ${r.url || 'N/A'}\n${r.text || ''}`)
                .join('\n\n---\n\n');
              sourceUrl = results[0]?.url || normalizedUrl;
            }
          }
        }
      } else {
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
            error: 'No web results found. Add a company website URL or check the name/location.',
          });
        }

        webContext = results.length
          ? results
              .map((r) => `Title: ${r.title || 'N/A'}\nURL: ${r.url || 'N/A'}\n${r.text || ''}`)
              .join('\n\n---\n\n')
          : '';
        sourceUrl = results[0]?.url || '';
      }

      if (!webContext && !partnerContext) {
        return res.json({
          error: 'Could not read the company website. Check the URL or try again later.',
        });
      }

      const userContent = companyOnly
        ? [
            `Analyze "${name}"${location ? ` (${location})` : ''} from the website content below.`,
            'Return JSON with:',
            '- synopsis: 2-4 factual sentences on what the company does (industry, products/services, scale if known). No partnership language.',
            '- locationQuery: headquarters as "City, Region, Country" for geocoding, or "" if not found in the content.',
            webContext ? `\nWebsite content:\n${webContext}` : '\nNo website content found.',
          ].join('\n')
        : [
            `Write a brief synopsis for "${name}" (${location || 'unknown location'}).`,
            partnerContext ? `\nInternal team context (use alongside web results):\n${partnerContext}` : '',
            webContext ? `\nWeb search results:\n${webContext}` : '\nNo web results found — summarize from internal context only.',
          ].join('');

      const systemContent = companyOnly
        ? 'You analyze company websites. Respond with ONLY valid JSON (no markdown): {"synopsis":"...","locationQuery":"City, Region, Country or empty string"}. Use only facts supported by the inputs.'
        : 'You write brief, factual partner synopses in 2-4 sentences. Combine public company facts from web results with internal partnership context when provided. Only state facts supported by the inputs. No marketing language.';

      const mistralRes = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${mistral}`,
        },
        body: JSON.stringify({
          model: 'mistral-small-latest',
          messages: [
            { role: 'system', content: systemContent },
            { role: 'user', content: userContent },
          ],
          max_tokens: companyOnly ? 320 : 250,
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
      const rawContent = mistralData.choices?.[0]?.message?.content?.trim();

      if (!rawContent) {
        return res.status(502).json({ error: 'Mistral returned an empty summary.' });
      }

      if (companyOnly) {
        const parsed = parseCompanyAnalysis(rawContent);
        const text = parsed.synopsis;
        if (!text) {
          return res.status(502).json({ error: 'Mistral returned an empty company synopsis.' });
        }

        const mapboxToken = process.env.MAPBOX_ACCESS_TOKEN;
        const geo = await resolveCompanyLocation(mapboxToken, {
          name,
          locationQuery: parsed.locationQuery,
          fallbackLocation: location,
        });

        return res.json({
          text,
          source: sourceUrl,
          locationQuery: parsed.locationQuery,
          location: geo?.label || parsed.locationQuery || location || '',
          lat: geo?.lat ?? null,
          lng: geo?.lng ?? null,
        });
      }

      const text = rawContent;

      res.json({ text, source: sourceUrl });
    } catch (err) {
      console.error('Synopsis error:', err);
      res.status(500).json({
        error: err.message || 'Synopsis generation failed.',
      });
    }
  });

  if (isProd && !isVercel) {
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

  return app;
}

const app = createApp();
export default app;
