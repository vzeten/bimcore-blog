// Общая обвязка проверок лишних файлов: временный репозиторий с НАСТОЯЩИМ git и пути одной статьи.
// Одна на два набора — правило с фактами и уборку в корзину: разойдись их среды, проверки говорили
// бы о разных положениях на диске.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {simpleGit} from 'simple-git';

const EDITOR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const НАСТРОЙКИ = JSON.parse(fs.readFileSync(path.join(EDITOR, 'settings.json'), 'utf8'));

export const RU = 'i18n/ru/docusaurus-plugin-content-docs/current/lessons/proba/index.mdx';
export const EN = 'docs/lessons/proba/index.mdx';
export const ES = 'i18n/es/docusaurus-plugin-content-docs/current/lessons/proba/index.mdx';
export const ПАПКА = {[RU]: path.posix.dirname(RU), [EN]: path.posix.dirname(EN), [ES]: path.posix.dirname(ES)};

export const шапка = (тело) => `---\ntitle: "Проба"\nslug: /lessons/proba\ndescription: "Про пробу."\n---\n\n${тело}\n`;
export const СТАТЬЯ = шапка('Текст статьи.');

export const песочницы = [];

/**
 * Временный репозиторий с настоящим git. `тексты` — текст каждой версии, `файлы` — прочие файлы
 * папок (путь → содержимое); `вКоммите` — что лежит в закреплённой ветке.
 */
export async function среда({тексты = {[RU]: СТАТЬЯ, [EN]: СТАТЬЯ}, файлы = {}, вКоммите = []} = {}) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-unused-'));
  песочницы.push(repo);
  const editorDir = path.join(repo, 'editor');
  const git = simpleGit(repo);

  await git.init(['--initial-branch=main']);
  await git.addConfig('user.name', 'Проверка');
  await git.addConfig('user.email', 'proverka@example.com');
  await git.addConfig('commit.gpgsign', 'false');

  const положить = (rel, содержимое) => {
    fs.mkdirSync(path.join(repo, path.dirname(rel)), {recursive: true});
    fs.writeFileSync(path.join(repo, rel), содержимое, 'utf8');
  };
  for (const [rel, текст] of Object.entries(тексты)) положить(rel, текст);
  for (const [rel, содержимое] of Object.entries(файлы)) положить(rel, содержимое);

  fs.writeFileSync(path.join(repo, 'README.md'), 'начало\n', 'utf8');
  await git.raw(['add', '--', 'README.md', ...вКоммите]);
  await git.raw(['commit', '-m', 'начало']);
  const основа = (await git.raw(['rev-parse', 'HEAD'])).trim();

  return {repo, editorDir, git, основа};
}
