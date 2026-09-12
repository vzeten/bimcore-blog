import assert from 'node:assert/strict';
import test from 'node:test';

import {
  collectSitemapUrls,
  extractSitemapUrls,
  submitIndexNow,
} from './indexnow-submit.mjs';

test('extracts and decodes sitemap locations', () => {
  assert.deepEqual(
    extractSitemapUrls(
      '<urlset><url><loc>https://learn.bimcore.one/a/?x=1&amp;y=2</loc></url></urlset>',
    ),
    ['https://learn.bimcore.one/a/?x=1&y=2'],
  );
});

test('collects unique URLs from every sitemap', async () => {
  const documents = new Map([
    ['https://learn.bimcore.one/sitemap.xml', '<loc>https://learn.bimcore.one/a/</loc>'],
    [
      'https://learn.bimcore.one/ru/sitemap.xml',
      '<loc>https://learn.bimcore.one/a/</loc><loc>https://learn.bimcore.one/ru/a/</loc>',
    ],
  ]);
  const urls = await collectSitemapUrls({
    sitemapUrls: [...documents.keys()],
    siteOrigin: 'https://learn.bimcore.one',
    fetchImpl: async (url) => new Response(documents.get(url)),
  });

  assert.deepEqual(urls, [
    'https://learn.bimcore.one/a/',
    'https://learn.bimcore.one/ru/a/',
  ]);
});

test('rejects foreign URLs from a sitemap', async () => {
  await assert.rejects(
    collectSitemapUrls({
      sitemapUrls: ['https://learn.bimcore.one/sitemap.xml'],
      siteOrigin: 'https://learn.bimcore.one',
      fetchImpl: async () => new Response('<loc>https://example.com/a/</loc>'),
    }),
    /foreign URL/,
  );
});

test('sends the verified batch and accepts initial HTTP 202', async () => {
  let request;
  const status = await submitIndexNow({
    key: '12345678-abcd',
    siteOrigin: 'https://learn.bimcore.one',
    urls: ['https://learn.bimcore.one/a/'],
    fetchImpl: async (url, options) => {
      request = {url, options};
      return new Response('', {status: 202});
    },
  });

  assert.equal(status, 202);
  assert.equal(request.url, 'https://api.indexnow.org/indexnow');
  assert.deepEqual(JSON.parse(request.options.body), {
    host: 'learn.bimcore.one',
    key: '12345678-abcd',
    keyLocation: 'https://learn.bimcore.one/12345678-abcd.txt',
    urlList: ['https://learn.bimcore.one/a/'],
  });
});

test('fails on an invalid key or rejected submission', async () => {
  await assert.rejects(
    submitIndexNow({
      key: 'short',
      siteOrigin: 'https://learn.bimcore.one',
      urls: ['https://learn.bimcore.one/a/'],
    }),
    /INDEXNOW_KEY/,
  );

  await assert.rejects(
    submitIndexNow({
      key: '12345678',
      siteOrigin: 'https://learn.bimcore.one',
      urls: ['https://learn.bimcore.one/a/'],
      fetchImpl: async () => new Response('invalid key', {status: 403}),
    }),
    /HTTP 403 invalid key/,
  );
});
