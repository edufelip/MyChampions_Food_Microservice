#!/usr/bin/env node
/*
Shadow validation script:
Compares legacy /searchFoods results against /catalog/searchFoods for query/lang scenarios.

Required env:
- BASE_URL          e.g. https://foodservice.eduwaldo.com
- AUTH_TOKEN        Firebase ID token

Optional env:
- REGION            default US
- MAX_RESULTS       default 10
- CATALOG_PAGE_SIZE default 10
- LANGS             comma list, default en,pt,es,fr,it
- QUERIES           comma list, default chicken,rice,banana,oats,beef
- MIN_OVERLAP_RATIO default 0.5
*/

const BASE_URL = (process.env.BASE_URL || '').trim().replace(/\/$/, '');
const AUTH_TOKEN = (process.env.AUTH_TOKEN || '').trim();
const REGION = (process.env.REGION || 'US').trim();
const MAX_RESULTS = Math.max(1, Number.parseInt(process.env.MAX_RESULTS || '10', 10));
const CATALOG_PAGE_SIZE = Math.max(1, Number.parseInt(process.env.CATALOG_PAGE_SIZE || '10', 10));
const LANGS = (process.env.LANGS || 'en,pt,es,fr,it')
  .split(',')
  .map((value) => value.trim())
  .filter((value) => value.length > 0);
const QUERIES = (process.env.QUERIES || 'chicken,rice,banana,oats,beef')
  .split(',')
  .map((value) => value.trim())
  .filter((value) => value.length > 0);
const MIN_OVERLAP_RATIO = Number.parseFloat(process.env.MIN_OVERLAP_RATIO || '0.5');

if (!BASE_URL || !AUTH_TOKEN) {
  console.error('Missing BASE_URL or AUTH_TOKEN');
  process.exit(2);
}

function overlapRatio(legacyIds, catalogIds) {
  if (legacyIds.length === 0 && catalogIds.length === 0) return 1;
  if (legacyIds.length === 0 || catalogIds.length === 0) return 0;

  const legacy = new Set(legacyIds);
  let overlap = 0;
  catalogIds.forEach((id) => {
    if (legacy.has(id)) overlap += 1;
  });
  return overlap / Math.max(legacyIds.length, catalogIds.length);
}

async function postJson(path, body) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${AUTH_TOKEN}`,
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  let json;
  try {
    json = text.length > 0 ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }

  return { status: response.status, body: json };
}

async function run() {
  const results = [];

  for (const lang of LANGS) {
    for (const query of QUERIES) {
      const legacy = await postJson('/searchFoods', {
        query,
        maxResults: MAX_RESULTS,
        region: REGION,
        language: lang,
      });

      const catalog = await postJson('/catalog/searchFoods', {
        lang,
        query,
        page: 1,
        pageSize: CATALOG_PAGE_SIZE,
        region: REGION,
      });

      const legacyResults = Array.isArray(legacy.body?.results) ? legacy.body.results : [];
      const catalogResults = Array.isArray(catalog.body?.results) ? catalog.body.results : [];
      const legacyIds = legacyResults.map((item) => String(item.id));
      const catalogIds = catalogResults.map((item) => String(item.id));
      const overlap = overlapRatio(legacyIds, catalogIds);

      results.push({
        lang,
        query,
        legacyStatus: legacy.status,
        catalogStatus: catalog.status,
        legacyCount: legacyIds.length,
        catalogCount: catalogIds.length,
        overlap,
      });
    }
  }

  const validComparisons = results.filter((item) => item.legacyStatus === 200 && item.catalogStatus === 200);
  const averageOverlap =
    validComparisons.length === 0
      ? 0
      : validComparisons.reduce((sum, item) => sum + item.overlap, 0) / validComparisons.length;

  console.log('\n== Shadow Validation Results ==');
  results.forEach((item) => {
    console.log(
      `${item.lang.padEnd(2)} | ${item.query.padEnd(12)} | legacy=${item.legacyStatus}(${item.legacyCount}) | catalog=${item.catalogStatus}(${item.catalogCount}) | overlap=${item.overlap.toFixed(2)}`,
    );
  });

  console.log(`\nCompared: ${validComparisons.length}/${results.length}`);
  console.log(`Average overlap: ${averageOverlap.toFixed(3)}`);
  console.log(`Threshold: ${MIN_OVERLAP_RATIO.toFixed(3)}`);

  if (validComparisons.length === 0 || averageOverlap < MIN_OVERLAP_RATIO) {
    console.error('Shadow validation failed');
    process.exit(1);
  }

  console.log('Shadow validation passed');
}

run().catch((error) => {
  console.error('Shadow validation script error:', error?.message || error);
  process.exit(1);
});
