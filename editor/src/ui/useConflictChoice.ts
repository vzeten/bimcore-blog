import {parseFrontmatter, type Field} from './headFields';
import type {Article, Root, SaveState} from './types';

/**
 * Выбор человека, когда файл на диске разошёлся с автосохранением.
 * Программа сама не решает: она только исполняет выбранное.
 * Вынесено из окна, чтобы обе ветви выбора лежали рядом и читались вместе.
 */
export function useConflictChoice(deps: {
  article: Article | null;
  roots: Root[];
  /** Общая картинка сайта: вписанная в статью, она показывается пустым полем. */
  общаяОбложка: string | null;
  setArticle: (article: Article) => void;
  setText: (text: string) => void;
  setFields: (fields: Field[]) => void;
  setDirty: (dirty: boolean) => void;
  setСостояние: (state: SaveState) => void;
  /**
   * Запомнить, что теперь в окне. Без этого следующая правка возьмёт устаревшее значение
   * и запишет в черновик смесь «тело от одного источника, шапка от другого».
   */
  запомнить: (body: string, frontmatterRaw: string) => void;
  /**
   * Отбросить черновик на диске: окно теперь повторяет файл, и записанный черновик,
   * равный файлу, сервер убирает сам. Без этого отвергнутый черновик возвращался бы
   * при следующем открытии и мог затереть внешнюю правку.
   */
  отброситьЧерновик: () => void;
}) {
  /** Продолжаем с автосохранения. Тело меняем целиком — редактор пересоздастся по ключу. */
  const взятьЧерновик = (): void => {
    const article = deps.article;
    if (!article?.черновик) return;

    const черновик = article.черновик;
    deps.setText(черновик.body);
    deps.setFields(parseFrontmatter(черновик.frontmatterRaw, article.path, deps.roots, deps.общаяОбложка));
    deps.setArticle({
      ...article,
      body: черновик.body,
      frontmatterRaw: черновик.frontmatterRaw,
      черновикРешение: 'нет',
    });
    deps.запомнить(черновик.body, черновик.frontmatterRaw);
    // Это несохранённая работа: она есть только в черновике, но не в файле.
    deps.setDirty(true);
    deps.setСостояние('естьНесохранённые');
  };

  /** Открываем файл с диска, автосохранение отбрасывается. */
  const взятьФайл = (): void => {
    const article = deps.article;
    if (!article) return;

    deps.setArticle({...article, черновикРешение: 'нет'});
    // В окне остаётся то, что пришло из файла, — это и есть новая точка отсчёта.
    deps.запомнить(article.body, article.frontmatterRaw);
    deps.отброситьЧерновик();
    deps.setDirty(false);
    deps.setСостояние('сохранено');
  };

  return {взятьЧерновик, взятьФайл};
}
