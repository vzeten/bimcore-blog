// Имя каждого теста повторяет формулировку правила.
// Что сейчас на САЙТЕ у каждой языковой версии статьи (решение владельца 2026-09-18, п.2): окно
// публикации показывает это до всякой проверки, по опубликованной основе, а не по файлу на диске.
// Настоящий git и учебный «сервер сайта» рядом.
import {afterEach, describe, expect, it, vi} from 'vitest';

import {publishStateRoute} from '../src/adapters/publishStateRoute.mjs';
import {releaseRoute} from '../src/adapters/releaseRoute.mjs';
import {ЖДАТЬ_GIT} from './saveHarness.mjs';
import {EN, ES, RU, СТАТЬЯ, запрос, среда, убратьПесочницы} from './publishHarness.mjs';

vi.setConfig({testTimeout: ЖДАТЬ_GIT, hookTimeout: ЖДАТЬ_GIT});
afterEach(() => убратьПесочницы());

const СОСЕД = 'i18n/ru/docusaurus-plugin-content-docs/current/lessons/other/index.mdx';
const СОСЕД_ТЕКСТ = '---\ntitle: "Другая"\nslug: /lessons/other\n---\n\nСм. [пробу](/lessons/proba/).\n';
const СКРЫТАЯ = СТАТЬЯ.replace('---\n\n', 'unlisted: true\n---\n\n');
const состояние = async (место, path = RU) => (await запрос(publishStateRoute, место, '/api/publish/state', {path})).payload;
const по = (ответ, путь) => ответ.локали.find((версия) => версия.путь === путь);

describe('состояние версий на сайте', () => {
  it('у каждого языка — лежит ли он на сайте и с какой доступностью, и сколько статей на него ссылаются', async () => {
    const место = await среда({[RU]: СКРЫТАЯ, [EN]: СТАТЬЯ, [ES]: СТАТЬЯ, [СОСЕД]: СОСЕД_ТЕКСТ}, {вКоммите: [RU, EN, СОСЕД]});

    const ответ = await состояние(место);

    expect(ответ.основаИзвестна).toBe(true);
    expect(по(ответ, RU)).toMatchObject({локаль: 'ru', наСайте: true, доступность: 'поСсылке', файлЕсть: true, ссылок: 1});
    expect(по(ответ, EN)).toMatchObject({локаль: 'en', наСайте: true, доступность: 'всем', ссылок: 0});
    expect(по(ответ, ES)).toMatchObject({локаль: 'es', наСайте: false, доступность: null, файлЕсть: true});
  });

  it('доступность берётся с сайта, а не из файла: местная правка шапки её не меняет', async () => {
    const место = await среда();
    место.положить(RU, СТАТЬЯ.replace('---\n\n', 'draft: true\n---\n\n'));

    expect(по(await состояние(место), RU)).toMatchObject({наСайте: true, доступность: 'всем'});
  });

  it('сайт спросить не удалось — «не знаю», а не «нет на сайте»', async () => {
    const место = await среда();
    await место.git.raw(['remote', 'set-url', 'origin', `${место.сервер}-нет`]);

    const ответ = await состояние(место);

    expect(ответ.основаИзвестна).toBe(false);
    expect(по(ответ, RU)).toMatchObject({наСайте: null, доступность: null});
  });

  it('число статей со ссылками считается тем же правилом, что у публикации: язык без своего файла, где сайт показывает обязательный, — тоже', async () => {
    // Русского файла на сайте нет: под русским адресом сайт показывает английский текст, и
    // «Недоступно» у русской версии убирает эту страницу и ссылки на неё.
    const место = await среда({[RU]: СТАТЬЯ, [EN]: СТАТЬЯ, [ES]: СТАТЬЯ, [СОСЕД]: СОСЕД_ТЕКСТ}, {вКоммите: [EN, ES, СОСЕД]});
    место.положить(RU, СТАТЬЯ.replace('---\n\n', 'draft: true\n---\n\n'));
    const показ = await запрос(releaseRoute, место, '/api/release', {path: RU});

    expect(по(await состояние(место), RU)).toMatchObject({наСайте: false, ссылок: 1});
    expect(показ.payload.ссылкиВСтатьях).toBe(1);
  });

  it('адрес сменён локально: число статей в окне считается по живому адресу — и совпадает с тем, что уберёт публикация', async () => {
    const место = await среда({[RU]: СТАТЬЯ, [EN]: СТАТЬЯ, [ES]: СТАТЬЯ, [СОСЕД]: СОСЕД_ТЕКСТ});
    место.положить(RU, СТАТЬЯ.replace('slug: /lessons/proba', 'slug: /lessons/proba-new').replace('---\n\n', 'draft: true\n---\n\n'));
    const показ = await запрос(releaseRoute, место, '/api/release', {path: RU});

    expect(по(await состояние(место), RU)).toMatchObject({наСайте: true, ссылок: 1});
    expect(показ.payload.ссылкиВСтатьях).toBe(1);
  });

  it('путь не статьи — отказ, а не пустой ответ', async () => {
    const место = await среда();

    expect((await запрос(publishStateRoute, место, '/api/publish/state', {path: 'README.md'})).status).toBe(400);
  });
});
