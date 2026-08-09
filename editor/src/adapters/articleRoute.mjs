// Ручка открытия статьи: что показать в окне и с чего продолжать работу.
// Вынесено из сервера, чтобы он оставался в пределах лимита размера файла (SPEC 4.9).
// Правил здесь нет: выбор «файл или черновик» — в ядре, слои цвета — в `layerChain`.

import fs from 'node:fs';
import path from 'node:path';

import {readField, splitArticle} from '../core/articleFile.mjs';
import {draftDecision} from '../core/drafts.mjs';
import {видСлоя} from '../core/authors.mjs';
import {articleFacts} from './articleFacts.mjs';
import {fingerprint, loadDraft} from './draftStore.mjs';
import {gitAuthor, publishedAt} from './gitFile.mjs';
import {historyLayers} from './layerChain.mjs';
import {loadState} from './library.mjs';

/**
 * Обрабатывает `/api/article`. Возвращает true, если запрос был к ней.
 *
 * `фиксировать` — сохранение внешней правки версией: файл могли изменить, пока статья была
 * закрыта, и чужая работа обязана попасть в историю до того, как её увидит окно.
 * `articles` и `publishedBody` приходят готовыми: свод статей и текст с сайта собирает сервер.
 */
export async function articleRoute({
  req, res, url, repo, editorDir, settings, git, publishedRef,
  insideRepo, send, фиксировать, articles, publishedBody, веткаИзвестна,
}) {
  if (url.pathname !== '/api/article' || req.method !== 'GET') return false;

  const rel = url.searchParams.get('path');
  const file = typeof rel === 'string' && rel !== '' ? path.join(repo, rel) : null;
  if (!file || !insideRepo(file) || !fs.existsSync(file)) {
    send(res, 404, {error: settings['ошибкиСервера']['нетСтатьи']});
    return true;
  }

  // Чтение ничего не теряет, поэтому сбой хранилища снимков открыть статью не мешает.
  await фиксировать(rel, false);

  const raw = fs.readFileSync(file, 'utf8');
  const {frontmatterRaw, body} = splitArticle(raw);
  const отпечаток = fingerprint(raw);

  // Что открывать: файл или автосохранение. Молча подменять файл нельзя — при конфликте решает человек.
  const draft = loadDraft(editorDir, settings, rel);
  const решение = draftDecision({
    draft,
    файл: {frontmatterRaw, body},
    отпечатокФайла: отпечаток,
    сейчас: new Date().toISOString(),
    settings,
  });
  const изЧерновика = решение === 'черновик';

  send(res, 200, {
    path: rel,
    // При свежем черновике сразу продолжаем работу с него, без вопроса.
    frontmatterRaw: изЧерновика ? draft['frontmatterRaw'] : frontmatterRaw,
    body: изЧерновика ? draft['body'] : body,
    // Тело именно ФАЙЛА, даже когда в окно пошёл черновик: на нём кончается цепочка слоёв цвета.
    // Возьми вместо него показанный текст — и незаписанная работа из черновика окрасилась бы
    // как уже сохранённая правка, хотя в файле её нет.
    телоФайла: body,
    отпечаток,
    черновикРешение: решение,
    // При конфликте отдаём оба варианта: файл выше, автосохранение здесь.
    черновик: решение === 'нет' ? null : {когда: draft['когда'], frontmatterRaw: draft['frontmatterRaw'], body: draft['body']},
    published: await publishedBody(rel),
    // Каким слоем показывать то, что записал сам человек за программой. Обычно это «мои правки»,
    // но правило одно на всех: подписался именем из справочника — правка машинная (критерий 4).
    мойСлой: видСлоя(await gitAuthor(git), settings['слоиПоАвторам'], await gitAuthor(git)),
    // Кто трогал текст между публикацией и сейчас. Считается при открытии статьи: набор текста
    // за этим на диск не ходит, иначе каждая буква стоила бы чтения истории.
    слои: historyLayers({
      editorDir,
      settings,
      rel,
      публикацияОт: await publishedAt(git, publishedRef, rel),
      ктоЯ: await gitAuthor(git),
    }),
    title: readField(frontmatterRaw, 'title') || rel,
    state: loadState(repo, rel, settings),
    ...articleFacts(await articles(), rel, settings),
    // Удалось ли прочитать опубликованную ветку. Без этого окно считало бы недоступную ветку
    // за «ничего не опубликовано» и предлагало бы удаление там, где сервер его запрещает.
    // Признак берётся от сборки свода: дерево ветки читается один раз за запрос, не дважды.
    веткаИзвестна: веткаИзвестна(),
  });

  return true;
}
