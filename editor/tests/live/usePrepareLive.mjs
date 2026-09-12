// Живая проверка usePrepare: настоящий hook и настоящий React из работающего редактора (Vite на
// localhost:4780), ответы POST /api/prepare держит в руках эта проверка и отдаёт их в нужном порядке.
// Ни одной статьи не читает и не пишет. Запуск (сервер редактора уже должен быть поднят):
//   node editor/tests/live/usePrepareLive.mjs
// Настройки испытания — только переменные окружения: EDITOR_URL, PLAYWRIGHT_DIR, HOOK_URL.
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';

const URL_РЕДАКТОРА = process.env.EDITOR_URL ?? 'http://localhost:4780';
const PLAYWRIGHT = process.env.PLAYWRIGHT_DIR
  ?? 'C:/Users/intli/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright';
const HOOK = process.env.HOOK_URL ?? '/src/ui/usePrepare.ts';

const {chromium} = createRequire(import.meta.url)(PLAYWRIGHT);
const browser = await chromium.launch({channel: 'msedge', headless: true});
const page = await browser.newPage();

// Каждый запрос подготовки повисает, пока проверка сама его не отпустит.
const запросы = [];
await page.route('**/api/prepare', (route) => запросы.push(route));
const пауза = () => page.waitForTimeout(40);
const успех = async (i, path) => {
  const body = JSON.stringify({path, находки: [], прошла: true, невыполненные: []});
  await запросы[i].fulfill({status: 200, contentType: 'application/json', body});
  await пауза();
};
const провал = async (i) => {
  await запросы[i].fulfill({status: 500, contentType: 'application/json', body: '{"error":"сбой"}'});
  await пауза();
};
const путьЗапроса = (i) => запросы[i].request().postDataJSON().path;

await page.goto(URL_РЕДАКТОРА, {waitUntil: 'load'});
// Адреса React берутся из того же Vite, что и у экрана: один экземпляр React, никакой копии.
const главный = await (await page.request.get(`${URL_РЕДАКТОРА}/src/ui/main.tsx`)).text();
const react = главный.match(/"([^"]*\/react\.js[^"]*)"/)?.[1];
const reactDom = главный.match(/"([^"]*\/react-dom_client\.js[^"]*)"/)?.[1];
assert.ok(react && reactDom, 'Vite не выдал адреса React');

// Пробный корешок: настоящий hook на подставных path/dirty, всё видимое — в window.__п.
await page.evaluate(async ({react, reactDom, hook}) => {
  // Оптимизированные модули Vite отдают API то именованно, то через default.
  const свой = (м) => (м.default && typeof м.default === 'object' ? м.default : м);
  const {useState, createElement} = свой(await import(react));
  const {createRoot} = свой(await import(reactDom));
  const {usePrepare} = await import(hook);
  function Корешок() {
    const [вход, setВход] = useState({path: 'A', dirty: false});
    window.__вход = (изменение) => setВход((было) => ({...было, ...изменение}));
    window.__п = usePrepare(вход.path, вход.dirty);
    return null;
  }
  createRoot(document.body.appendChild(document.createElement('div'))).render(createElement(Корешок));
}, {react, reactDom, hook: HOOK});
await пауза();

const состояние = () => page.evaluate(() => ({
  отчёт: window.__п.отчёт?.path ?? null, ошибка: window.__п.ошибка, идёт: window.__п.идёт,
}));
const нажать = async () => { await page.evaluate(() => { window.__п.запустить(); }); await пауза(); };
const вход = async (изменение) => { await page.evaluate((и) => window.__вход(и), изменение); await пауза(); };
const ждать = async (ожидание, что) => assert.deepEqual(await состояние(), ожидание, что);
const свободно = {отчёт: null, ошибка: null, идёт: false};
const занято = {отчёт: null, ошибка: null, идёт: true};

// Ядро контракта: второй запрос уходит ДО ответа первого, поздний ответ A не трогает B.
// Три исхода запроса A: поздний успех, поздняя ошибка, ответ после B (обратный порядок).
for (const исходA of ['успех', 'ошибка', 'после B']) {
  const было = запросы.length;
  await вход({path: 'A'});
  await нажать();
  await ждать(занято, `${исходA}: A занят`);
  await вход({path: 'B'});
  await ждать(свободно, `${исходA}: смена статьи освобождает кнопку`);
  await нажать();
  assert.equal(запросы.length, было + 2, `${исходA}: запросов именно два`);
  assert.equal(путьЗапроса(было + 1), 'B', `${исходA}: второй запрос действительно про B`);
  await ждать(занято, `${исходA}: B занят до ответа`);
  if (исходA === 'после B') {
    await успех(было + 1, 'B');
    await ждать({отчёт: 'B', ошибка: null, идёт: false}, `${исходA}: отчёт B, занятости нет`);
    await успех(было, 'A');
  } else {
    await (исходA === 'успех' ? успех(было, 'A') : провал(было));
    await ждать(занято, `${исходA}: поздний ответ A не менял отчёт, ошибку и занятость B`);
    await успех(было + 1, 'B');
  }
  await ждать({отчёт: 'B', ошибка: null, идёт: false}, `${исходA}: после всех ответов только отчёт B`);
}

// Штатные успех и ошибка на неизменённой статье.
let n = запросы.length;
await вход({path: 'A'});
await нажать();
await успех(n, 'A');
await ждать({отчёт: 'A', ошибка: null, идёт: false}, 'штатный успех');
await нажать();
await провал(n + 1);
await ждать({отчёт: 'A', ошибка: 'сбой', идёт: false}, 'штатная ошибка рядом с прежним отчётом');
await page.evaluate(() => window.__п.закрыть());
await пауза();
await ждать(свободно, 'закрытие отчёта гасит отчёт и ошибку');

// A -> B -> A: вернулись к A до ответа A — старый ответ всё равно чужой.
n = запросы.length;
await нажать();
await вход({path: 'B'});
await вход({path: 'A'});
await успех(n, 'A');
await ждать(свободно, 'A->B->A: поздний ответ A не возвращается');

// Новая правка во время запроса: ответ не показывается, dirty true -> false его не воскрешает.
await нажать();
await вход({dirty: true});
await ждать(свободно, 'правка освобождает кнопку');
await успех(n + 1, 'A');
await вход({dirty: false});
await ждать(свободно, 'после dirty true -> false старый отчёт не возвращается');

// Закрытие статьи во время запроса.
await нажать();
await вход({path: null});
await успех(n + 2, 'A');
await ждать(свободно, 'закрытие статьи: поздний ответ не показывается');

// Двойное нажатие — один запрос.
await вход({path: 'A'});
n = запросы.length;
await page.evaluate(() => { window.__п.запустить(); window.__п.запустить(); });
await пауза();
assert.equal(запросы.length, n + 1, 'двойное нажатие не плодит запрос');
await успех(n, 'A');
await ждать({отчёт: 'A', ошибка: null, идёт: false}, 'после двойного нажатия кнопка свободна');

await browser.close();
console.log(`usePrepare: все утверждения выполнены, запросов перехвачено ${запросы.length}`);
