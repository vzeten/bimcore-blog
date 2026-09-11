// Ручка открытия статьи: что показать в окне и с чего продолжать работу.
// Вынесено из сервера, чтобы он оставался в пределах лимита размера файла (SPEC 4.9).
// Правил здесь нет: выбор «файл или черновик» — в ядре, слои цвета — в `layerChain`.

import fs from 'node:fs';
import path from 'node:path';

import {nothingChanged, readField, splitArticle} from '../core/articleFile.mjs';
import {isUnlisted} from '../core/frontmatterRules.mjs';
import {draftDecision} from '../core/drafts.mjs';
import {видСлоя} from '../core/authors.mjs';
import {articleFacts} from './articleFacts.mjs';
import {прочитатьСпор, спорДляОкна} from './conflictStore.mjs';
import {свестиПриОткрытии} from './mergeGate.mjs';
import {fingerprint, loadDraft} from './draftStore.mjs';
import {gitAuthor, publishedAt, showFile} from './gitFile.mjs';
import {historyLayers} from './layerChain.mjs';
import {loadState} from './library.mjs';

/**
 * Открытая версия статьи такой, какой её видит сайт: тело и видимость. `null` в обоих полях —
 * файла в опубликованной ветке нет, и сказать про сайт нечего.
 *
 * Спрашивается ровно про открытый путь, а не про все языковые версии: видимость принадлежит
 * версии (SPEC 2.8), и соседняя версия про эту ничего не решает. Чтение одно на всю ручку —
 * тело и видимость берутся из одного `git show`, а не двумя запросами по тому же пути.
 *
 * Осторожно: `showFile` отвечает `null` и на «файла в ветке нет», и на любой сбой git. Отличить
 * одно от другого можно только признаком `веткаИзвестна`, который считается отдельно, при сборке
 * свода статей; окно обязано гасить статус по нему ДО сравнения видимости.
 */
async function версияНаСайте(git, ref, rel) {
  const raw = await showFile(git, ref, rel);
  if (raw === null) return {тело: null, скрыта: null};

  const {frontmatterRaw, body} = splitArticle(raw);
  return {тело: body, скрыта: isUnlisted(frontmatterRaw)};
}

/**
 * Обрабатывает `/api/article`. Возвращает true, если запрос был к ней.
 *
 * `фиксировать` — сохранение внешней правки версией: файл могли изменить, пока статья была
 * закрыта, и чужая работа обязана попасть в историю до того, как её увидит окно.
 * `articles` приходит готовым: свод статей собирает сервер.
 */
export async function articleRoute({
  req, res, url, repo, settings, git, publishedRef,
  insideRepo, send, фиксировать, articles, веткаИзвестна,
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
  const факты = articleFacts(await articles(), rel, settings);
  const наСайте = await версияНаСайте(git, publishedRef, rel);

  const draft = loadDraft(repo, settings, rel);
  const решение = draftDecision({
    draft,
    файл: {frontmatterRaw, body},
    отпечатокФайла: отпечаток,
    сейчас: new Date().toISOString(),
    settings,
  });

  // Работа, с которой человек продолжит. Выбора «весь черновик или весь файл» здесь больше нет:
  // разошедшиеся стороны сводятся, и спрашивают только про пересечение.
  let работа = решение === 'нет'
    ? {frontmatterRaw, body}
    : {frontmatterRaw: draft['frontmatterRaw'], body: draft['body']};

  // Отложенный раньше спор этой версии: возвращаясь в статью, человек снова видит панель со
  // сторонами, а не продолжает работу поверх нерешённого расхождения.
  let спор = прочитатьСпор(repo, settings, rel);

  if (спор === null && решение === 'конфликт') {
    // Открытие ничего не теряет, поэтому запись версии здесь необязательная: недоступное
    // хранилище снимков не должно мешать открыть статью.
    const сведение = await свестиПриОткрытии({
      repo, settings, rel, черновик: draft, git, ref: publishedRef,
      фиксировать: (путь) => фиксировать(путь, false),
    });
    работа = сведение.работа;
    спор = прочитатьСпор(repo, settings, rel);
  }

  if (спор !== null && спор['мои']) работа = спор['мои'];

  send(res, 200, {
    path: rel,
    // Незаписанная работа продолжается сразу, без вопроса: она уже сведена с файлом.
    frontmatterRaw: работа.frontmatterRaw,
    body: работа.body,
    // Тело именно ФАЙЛА, даже когда в окно пошёл черновик: на нём кончается цепочка слоёв цвета.
    // Возьми вместо него показанный текст — и незаписанная работа из черновика окрасилась бы
    // как уже сохранённая правка, хотя в файле её нет.
    телоФайла: body,
    отпечаток,
    // Есть ли в окне работа, которой нет в файле. Считается сравнением, а не памятью о том,
    // откуда текст взялся: после сведения он не равен ни файлу, ни прежнему черновику.
    черновикРешение: nothingChanged({frontmatterRaw, body}, работа) ? 'нет' : 'черновик',
    // Спор этой версии со всеми сторонами либо `null`. Пока он есть, версия ждёт решения человека.
    спор: спорДляОкна(спор),
    published: наСайте.тело,
    // Каким слоем показывать то, что записал сам человек за программой. Обычно это «мои правки»,
    // но правило одно на всех: подписался именем из справочника — правка машинная (критерий 4).
    мойСлой: видСлоя(await gitAuthor(git), settings['слоиПоАвторам'], await gitAuthor(git)),
    // Кто трогал текст между публикацией и сейчас. Считается при открытии статьи: набор текста
    // за этим на диск не ходит, иначе каждая буква стоила бы чтения истории.
    слои: historyLayers({
      repo,
      settings,
      rel,
      публикацияОт: await publishedAt(git, publishedRef, rel),
      ктоЯ: await gitAuthor(git),
    }),
    title: readField(frontmatterRaw, 'title') || rel,
    state: loadState(repo, rel, settings),
    ...факты,
    // Какой видит ОТКРЫТУЮ версию сам сайт. По этому окно честно говорит «изменение ещё не
    // на сайте»: видимость в окне сравнивается не с догадкой, а с выпущенной версией.
    // `null` — версии в опубликованной ветке нет вовсе (либо ветку не прочитать, см. ниже).
    скрытаНаСайте: наСайте.скрыта,
    // Удалось ли прочитать опубликованную ветку. Без этого окно считало бы недоступную ветку
    // за «ничего не опубликовано» и предлагало бы удаление там, где сервер его запрещает.
    // Признак берётся от сборки свода: дерево ветки читается один раз за запрос, не дважды.
    веткаИзвестна: веткаИзвестна(),
  });

  return true;
}
