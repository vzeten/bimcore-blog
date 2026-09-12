import path from 'node:path';
import {pathToFileURL} from 'node:url';

const SITE_ORIGIN = 'https://learn.bimcore.one';
const SITEMAP_URLS = [
  `${SITE_ORIGIN}/sitemap.xml`,
  `${SITE_ORIGIN}/ru/sitemap.xml`,
  `${SITE_ORIGIN}/es/sitemap.xml`,
  `${SITE_ORIGIN}/video-sitemap.xml`,
];
const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';
const REQUEST_TIMEOUT_MS = 15_000;

function decodeXmlText(value) {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'");
}

export function extractSitemapUrls(xml) {
  return [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)].map((match) =>
    decodeXmlText(match[1]),
  );
}

export async function collectSitemapUrls({
  sitemapUrls,
  siteOrigin,
  fetchImpl = fetch,
}) {
  const urls = new Set();

  for (const sitemapUrl of sitemapUrls) {
    const response = await fetchImpl(sitemapUrl, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`cannot read ${sitemapUrl}: HTTP ${response.status}`);
    }

    for (const value of extractSitemapUrls(await response.text())) {
      const url = new URL(value);
      if (url.origin !== siteOrigin) {
        throw new Error(`foreign URL in sitemap: ${value}`);
      }
      urls.add(url.href);
    }
  }

  if (urls.size === 0) {
    throw new Error('sitemaps contain no URLs');
  }

  return [...urls].sort();
}

export async function submitIndexNow({
  key,
  siteOrigin,
  urls,
  endpoint = INDEXNOW_ENDPOINT,
  fetchImpl = fetch,
}) {
  if (!/^[A-Za-z0-9-]{8,128}$/.test(key)) {
    throw new Error('INDEXNOW_KEY must contain 8-128 letters, digits or dashes');
  }

  const site = new URL(siteOrigin);
  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: {'content-type': 'application/json; charset=utf-8'},
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    body: JSON.stringify({
      host: site.host,
      key,
      keyLocation: `${siteOrigin}/${key}.txt`,
      urlList: urls,
    }),
  });

  if (response.status !== 200 && response.status !== 202) {
    const details = (await response.text()).slice(0, 500);
    throw new Error(`IndexNow rejected URLs: HTTP ${response.status} ${details}`);
  }

  return response.status;
}

async function main() {
  const key = process.env.INDEXNOW_KEY ?? '';
  const urls = await collectSitemapUrls({
    sitemapUrls: SITEMAP_URLS,
    siteOrigin: SITE_ORIGIN,
  });

  if (process.argv.includes('--check')) {
    console.log(`[indexnow] collected ${urls.length} unique URLs`);
    return;
  }

  const status = await submitIndexNow({key, siteOrigin: SITE_ORIGIN, urls});
  console.log(`[indexnow] submitted ${urls.length} URLs, HTTP ${status}`);
}

const isDirectRun =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isDirectRun) {
  await main();
}
