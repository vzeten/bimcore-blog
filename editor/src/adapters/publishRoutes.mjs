// Все ручки выпуска одним входом: дата блога, обложка, состав с быстрыми проверками, состояние на
// сайте, поля отмеченных неоткрытых языков, запись статьи и снятия, уборка ссылок, отправка и значок
// «Сайт». Вынесено из сервера: он упёрся в предел размера файла (SPEC 4.9), а порядок этих ручек — одно правило, не шесть строк там.
//
// Набор на заход один: настройки читаются сервером один раз на запрос, иначе правка файла настроек
// посреди запроса развела бы шаги одного решения по разным правилам.

import {publishDateRoute} from './publishDateRoute.mjs';
import {publishCoverRoute} from './publishCoverRoute.mjs';
import {releaseRoute} from './releaseRoute.mjs';
import {publishStateRoute} from './publishStateRoute.mjs';
import {publishVersionsRoute} from './publishVersionsRoute.mjs';
import {publishRoute} from './publishRoute.mjs';
import {retireRoute} from './retireRoute.mjs';
import {linkSweepRoute} from './linkSweep.mjs';
import {pushRoute} from './pushRoute.mjs';
import {siteStateRoute} from './siteStateRoute.mjs';

/**
 * Обработать запрос одной из ручек выпуска. `набор` — то, что сервер даёт каждой ручке; `слежение` —
 * опрос выкладки на GitHub (`deployWatch.слежение`), один на сервер. Возвращает true, если запрос
 * был к одной из них.
 *
 * Записи статьи и снятия — единственные ручки, меняющие git (без отправки); отправка — отдельным
 * заходом после показа; уборка ссылок пишет только диск.
 */
export async function publishRoutes(набор, слежение) {
  return await publishDateRoute(набор) || await publishCoverRoute(набор) || await releaseRoute(набор)
    || await publishStateRoute(набор) || await publishVersionsRoute(набор) || await publishRoute(набор) || await retireRoute(набор)
    || await linkSweepRoute(набор) || await pushRoute(набор) || await siteStateRoute({...набор, слежение});
}
