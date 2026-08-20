import type {Dispatch, MutableRefObject, SetStateAction} from 'react';
import {loadArticle} from './actions';
import {requestJson} from './api';
import {parseFrontmatter, type Field} from './headFields';
import type {Deletion} from '../core/colorize';
import type {Article, ArticleRow, PanelMode, SaveState, Settings} from './types';

/**
 * Переходы окна: обновить реестр, открыть статью, закрыть статью.
 * Вынесено из окна, чтобы правила ухода из статьи лежали одним куском, а окно не выходило
 * за предел размера файла (SPEC 4.9).
 *
 * Главное правило здесь одно: уход из статьи не теряет работу. Ждущая правка дописывается
 * до перехода, и если записать не вышло — перехода не происходит вовсе.
 */
export function useNavigation(deps: {
  article: Article | null;
  settingsRef: MutableRefObject<Settings | null>;
  автосохранение: {дописать: () => Promise<boolean>};
  версии: {сбросить: () => void};
  текстСейчас: MutableRefObject<string>;
  шапкаСейчас: MutableRefObject<string>;
  /** Какая статья открыта. Обновляется сразу при переходе, а не при следующей отрисовке. */
  статьяСейчас: MutableRefObject<string | null>;
  /**
   * Номер открытия: растёт при каждом переходе. По нему поздний ответ отличают не только
   * от другой статьи, но и от прошлого захода в ту же самую.
   */
  открытие: MutableRefObject<number>;
  runSafe: (action: () => Promise<void>) => Promise<boolean>;
  setArticles: (rows: ArticleRow[]) => void;
  setArticle: Dispatch<SetStateAction<Article | null>>;
  setFields: (fields: Field[]) => void;
  setText: (text: string) => void;
  setDeletions: (deletions: Deletion[]) => void;
  setMode: (mode: PanelMode) => void;
  setDirty: (dirty: boolean) => void;
  setОшибка: (текст: string | null) => void;
  setКонфликтСохранения: (конфликт: boolean) => void;
  setСостояние: (state: SaveState) => void;
}) {
  const открытие = deps.открытие;

  const refresh = async (): Promise<void> => {
    // Провал не должен подменить список объектом ошибки — оставляем прежний.
    await deps.runSafe(async () => {
      deps.setArticles(await requestJson<ArticleRow[]>('/api/articles'));
    });
  };

  /**
   * Открыть статью. Отвечает, состоялся ли переход: зовущий не должен рассказывать человеку
   * об открытой версии, когда окно осталось на прежней статье — например, потому что не легла
   * ждущая правка или файл не прочитался.
   */
  const open = async (path: string, push = true): Promise<boolean> => {
    const s = deps.settingsRef.current;
    if (!s) return false; // настройки ещё не загрузились — «назад» ничего не делает, но не падает

    // Уходя, ждущую правку дописываем, а не выбрасываем (почему — в `autosaveQueue`).
    // Не записалось — не уходим: работа есть только в окне, и уйти значит её потерять.
    if (!(await автосохранениеДописано())) return false;

    const моё = открытие.current + 1;
    открытие.current = моё;
    let art: Article | null = null;

    await loadArticle<Article>(path, {
      актуально: () => моё === открытие.current,
      ok: (статья) => {
        art = статья;
      },
      fail: (причина) => deps.setОшибка(причина),
    });

    if (art === null) return false;
    // Пока грузилась новая статья, человек мог печатать дальше в старой: дописываем и это.
    if (!(await автосохранениеДописано()) || моё !== открытие.current) return false;

    применить(art, path, s);
    if (push) history.pushState({вид: 'статья', path}, '');
    return true;
  };

  const closeArticle = async (): Promise<void> => {
    // Закрытие уносит окно вместе с ждущей правкой, поэтому сначала дописываем. Не записалось —
    // статью не закрываем и возвращаем шаг истории на место: «назад» отменить нельзя, а терять
    // работу нельзя тем более. Причину человек видит от автосохранения.
    if (!(await автосохранениеДописано())) {
      if (deps.article) history.pushState({вид: 'статья', path: deps.article.path}, '');
      return;
    }

    открытие.current += 1; // поздний ответ уже закрытой статьи окно не воскресит
    deps.статьяСейчас.current = null;
    deps.версии.сбросить();
    deps.setArticle(null);
    deps.setMode(null);
  };

  return {refresh, open, closeArticle};

  async function автосохранениеДописано(): Promise<boolean> {
    return deps.автосохранение.дописать();
  }

  function применить(art: Article, path: string, s: Settings): void {
    // Сразу, а не при следующей отрисовке: поздний ответ сохранения прошлой статьи иначе
    // успел бы пройти как актуальный и применить её текст к уже открытой другой.
    deps.статьяСейчас.current = path;
    deps.setОшибка(null);
    deps.setКонфликтСохранения(false);
    deps.версии.сбросить(); // лента и просмотр относились к прошлому файлу
    deps.setArticle({...art, заход: открытие.current});
    deps.setFields(parseFrontmatter(art.frontmatterRaw, path, s.контент, s.сайт?.обложкаПоУмолчанию ?? null));
    deps.setText(art.body);
    deps.setDeletions([]);
    // Исходное состояние окна: от него считается «есть несохранённое».
    deps.текстСейчас.current = art.body;
    deps.шапкаСейчас.current = art.frontmatterRaw;
    deps.setMode(null);

    // Продолжили с автосохранения — это несохранённая работа, так и показываем.
    const изЧерновика = art.черновикРешение === 'черновик';
    deps.setDirty(изЧерновика);
    deps.setСостояние(изЧерновика ? 'автосохранено' : 'сохранено');
  }
}
