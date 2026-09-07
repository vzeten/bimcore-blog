// Статья и её языковые версии, какими их отдаёт сервер реестру и шапке окна.
// Отделены от общих понятий окна пределом размера файла (SPEC 4.9); смысл не менялся.

/**
 * Признаки одной языковой версии — то, что видно возле её обозначения. Независимы и складываются;
 * что каждый значит и как они спорят за цвет букв, решает ядро (`core/localeSigns.mjs`).
 */
export interface ПризнакиЛокали {
  есть: boolean;
  черновик: boolean;
  неПубликовалась: boolean;
  изменена: boolean;
  заглушка: boolean;
  поСсылке: boolean;
}

/** Языковая версия статьи: свой файл, своё название, своя готовность и своя видимость. */
export interface ArticleVersion {
  path: string;
  title: string;
  скрыта: boolean;
  готовность: string | null;
  /**
   * Лежит ли версия в опубликованной ветке и расходится ли с ней. `null` — не известно: ветку
   * или сравнение прочитать не удалось, и это не то же самое, что «нет» (SPEC 4.5.2).
   */
  опубликован: boolean | null;
  отличается: boolean | null;
  /** Версия осталась заглушкой перевода — той, что программа написала сама. */
  заглушка: boolean;
  /** В шапке версии стоит `draft: true`: сборка сайта такую страницу не выпускает вовсе. */
  черновикСайта: boolean;
  правил: string | null;
  когда: number;
}

/** Статья как одна сущность: несколько языковых версий под одним именем. */
export interface ArticleRow {
  key: string;
  kind: string;
  наСайте: boolean;
  category: string;
  section: {kind: string; path: string};
  folders: string[];
  title: string;
  titleFromOtherLocale: boolean;
  служебная: boolean;
  нетНаСайте: boolean;
  versions: Record<string, ArticleVersion>;
}
