// Понятия, общие для всех зон окна.

/** Языковая версия статьи: свой файл, своё название, своя готовность и своя видимость. */
export interface ArticleVersion {
  path: string;
  title: string;
  скрыта: boolean;
  готовность: string | null;
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

/** Автосохранённый черновик статьи, каким его отдаёт сервер. */
export interface Draft {
  когда: string;
  frontmatterRaw: string;
  body: string;
}

export interface Article {
  path: string;
  frontmatterRaw: string;
  body: string;
  published: string | null;
  title: string;
  category: string;
  служебная: boolean;
  готовность: string | null;
  скрыта: boolean;
  /** Отпечаток файла на момент открытия: по нему видно, менялся ли файл под черновиком. */
  отпечаток: string;
  черновикРешение: 'нет' | 'черновик' | 'конфликт';
  /**
   * Номер захода в статью. Нужен, чтобы повторное открытие той же статьи пересоздавало
   * редактор: иначе в спрятанной зоне остаётся текст прошлого захода и затирает внешнюю правку.
   */
  заход?: number;
  черновик: Draft | null;
  versions: Record<string, string>;
  states: Record<string, 'есть' | 'нет' | 'устарела'>;
  нетНаСайте: boolean;
}

/** Одна версия в ленте: имя снимка, время и автор. Имя — внутренний договор сервера и окна. */
export interface Версия {
  имя: string;
  iso: string;
  author: string;
}

/** Сеанс: подряд идущие сохранения одного автора, свёрнутые в одну отметку ленты. */
export interface Сеанс {
  author: string;
  from: string;
  to: string;
  snapshots: Версия[];
}

/** Версия, открытая на просмотр. Только чтение: правки и сохранения в этом состоянии нет. */
export interface ПросмотрВерсии {
  имя: string;
  когда: string;
  автор: string;
  frontmatterRaw: string;
  body: string;
}

/** Состояние автосохранения для шапки. */
export type SaveState = 'сохранено' | 'естьНесохранённые' | 'сохраняем' | 'автосохранено' | 'неУдалосьАвтосохранить';

export interface Button {
  группа: string;
  подпись: string;
  команда: string;
  уровень?: number;
  знак?: string;
  вид?: 'точки' | 'числа';
  столбцов?: number;
  строк?: number;
  текст?: string;
}

export interface Column {
  ключ: string;
  подпись: string;
}

export interface Root {
  локаль: string;
  род: string;
  папка: string;
  наСайте: boolean;
}

export interface Settings {
  слои: Record<string, {подпись: string; цвет: string; пояснение: string}>;
  локали: Record<string, string>;
  основнойЯзык: string;
  /** Вид времени версий. Меняется в настройках, в коде своего формата нет. */
  форматВремени: Intl.DateTimeFormatOptions;
  обязательныйЯзык: string;
  категорияСлужебной: string;
  вставки: Button[];
  призывПоРазделу: Record<string, string>;
  статусы: string[];
  подписи: Record<string, string>;
  видимость: {вМеню: string; поСсылке: string};
  хранение: {
    файлСостояния: string;
    папкаЧерновиков: string;
    папкаСнимков: string;
    автосохранениеСек: number;
    черновикЖивётДней: number;
    снимковНаВерсию: number;
  };
  категорииПоПути: Record<string, string>;
  категорииПоРоду: Record<string, string>;
  подписиПолей: Record<string, string>;
  названияРазделов: Record<string, string>;
  контент: Root[];
  реестр: {
    колонки: Column[];
    сортировкаПоУмолчанию: string;
    всеРазделы: string;
    любая: string;
    толькоДыры: string;
    нетНаСайте: string;
    неизвестныйАвтор: string;
    разное: string;
  };
}

export type PanelMode = 'статьи' | 'версии' | null;
