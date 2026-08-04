// Главный предохранитель: открыть статью и сохранить без правок — файл не должен измениться.
// Проверяется на всех настоящих статьях сайта, а не на выдуманном примере.
// Проверяется именно так, как сохраняет сервер: шапка собирается заново, а не приклеивается обратно.
import {describe, expect, it} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildHead, joinArticle, splitArticle} from '../src/core/articleFile.mjs';
import {walk} from '../src/adapters/library.mjs';

const EDITOR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = path.resolve(EDITOR, '..');

// Корни берутся из настроек: второй список путей рядом с настройками — это второй источник правды.
const НАСТРОЙКИ = JSON.parse(fs.readFileSync(path.join(EDITOR, 'settings.json'), 'utf8'));
const files = НАСТРОЙКИ['контент'].flatMap((root) => walk(path.join(REPO, root['папка'])));

describe('сохранение без правок ничего не меняет', () => {
  it('статьи вообще нашлись', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  for (const file of files) {
    const rel = path.relative(REPO, file).split(path.sep).join('/');

    it(rel, () => {
      const raw = fs.readFileSync(file, 'utf8');
      const parts = splitArticle(raw);

      expect(joinArticle(parts)).toBe(raw);

      // Так статью пересобирает сервер при сохранении.
      const head = buildHead({frontmatterRaw: parts.frontmatterRaw, eol: parts.eol, метка: parts.метка});
      expect(joinArticle({head, body: parts.body})).toBe(raw);
    });
  }

  it('шапка читается, даже если файл начинается с невидимой метки', () => {
    const метка = '﻿';
    const raw = `${метка}---\ntitle: Тест\n---\n\nТекст.\n`;
    const parts = splitArticle(raw);

    expect(parts.frontmatterRaw).toBe('title: Тест');
    expect(parts.body).toBe('\nТекст.\n');
    expect(joinArticle(parts)).toBe(raw);
  });

  it('невидимая метка остаётся в файле после пересборки шапки', () => {
    const метка = '﻿';
    const raw = `${метка}---\ntitle: Тест\n---\nТекст.\n`;
    const parts = splitArticle(raw);
    const head = buildHead({frontmatterRaw: parts.frontmatterRaw, eol: parts.eol, метка: parts.метка});

    expect(joinArticle({head, body: parts.body})).toBe(raw);
  });
});
