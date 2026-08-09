// Имя каждого теста повторяет формулировку правила.
// Общая обложка сайта читается из конфига Docusaurus как из единственного источника правды.
import {describe, expect, it} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {обложкаСайта} from '../src/core/siteConfig.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('общая обложка сайта', () => {
  it('путь общей обложки берётся из конфига настоящего сайта', () => {
    // Проверка на живом конфиге, а не на выдуманном куске: разойдись разбор с реальным файлом —
    // окно молча показывало бы «обложку найти не удалось» на каждой статье.
    const текст = fs.readFileSync(path.join(REPO, 'docusaurus.config.js'), 'utf8');
    expect(обложкаСайта(текст)).toMatch(/^\/.+\.(jpg|jpeg|png)$/);
  });

  it('путь без ведущей косой приводится к адресу сайта', () => {
    // В конфиге принято писать `img/social-card.jpg`, а адресом служит `/img/social-card.jpg`.
    expect(обложкаСайта("themeConfig: ({ image: 'img/social-card.jpg' })")).toBe('/img/social-card.jpg');
  });

  it('путь с ведущей косой остаётся как есть', () => {
    expect(обложкаСайта('themeConfig: ({ image: "/img/a.png" })')).toBe('/img/a.png');
  });

  it('обложка берётся у темы, а не у вложенного блока с тем же именем поля', () => {
    const текст = "themeConfig: ({ navbar: { logo: { image: 'логотип.png' } }, image: 'общая.png' })";
    expect(обложкаСайта(текст)).toBe('/общая.png');
  });

  it('поле только во вложенном блоке — общей обложки нет', () => {
    // Логотип навбара не обложка сайта: выдать его за неё значит показать человеку неправду.
    expect(обложкаСайта("themeConfig: ({ navbar: { logo: { image: 'логотип.png' } } })")).toBeNull();
  });

  it('закомментированная обложка не считается обложкой', () => {
    expect(обложкаСайта("themeConfig: ({ /* image: 'старая.png' */ colorMode: {} })")).toBeNull();
    expect(обложкаСайта("themeConfig: ({\n  // image: 'старая.png'\n  colorMode: {}\n})")).toBeNull();
  });

  it('поля темы в конфиге нет — обложка не выдумывается', () => {
    expect(обложкаСайта('export default {title: "Сайт"};')).toBeNull();
  });

  it('конфиг не прочитан — обложки нет, а не падение', () => {
    expect(обложкаСайта(null)).toBeNull();
    expect(обложкаСайта('')).toBeNull();
  });

  it('пустое значение обложки в конфиге считается отсутствием', () => {
    expect(обложкаСайта("themeConfig: ({ image: '' })")).toBeNull();
  });
});
