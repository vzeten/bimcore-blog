// Как показывается статья: одно правило на оба случая — правку и просмотр старой версии.
// Держать два списка расширений нельзя: тогда «читается как статья» пришлось бы чинить дважды.

import {EditorState, type Extension} from '@codemirror/state';
import {EditorView} from '@codemirror/view';
import {markdown} from '@codemirror/lang-markdown';
import {livePreview} from '../livePreview';
import type {КартинкаВОкне} from '../livePreview/inline';
import type {БлокВОкне} from '../livePreview/blocks';
import type {ОписаниеБлока} from '../types';

/**
 * Общий показ: разметка, перенос строк, живой вид блоков. Путь нужен живому показу картинок,
 * `названиеСовета` — обычное имя совета на языке открытой статьи.
 * `onImage` и `onБлок` — нажатие по картинке и по блоку статьи; просмотр версии их не передаёт,
 * и там нажатие молчит: панели свойств правят текст, а в просмотре разрешено только чтение.
 */
export function чтениеСтатьи(
  path: () => string,
  блоки: Record<string, ОписаниеБлока>,
  названиеСовета: string,
  onImage?: (картинка: КартинкаВОкне) => void,
  onБлок?: (блок: БлокВОкне) => void,
): Extension[] {
  return [
    markdown(),
    EditorView.lineWrapping,
    livePreview(path, блоки, названиеСовета, onImage, onБлок),
  ];
}

/**
 * Просмотр версии: тот же вид, но менять нечего.
 * Запрет именно на уровне состояния редактора, а не «мы просто не слушаем правки»:
 * иначе набранный в старой версии текст ушёл бы в автосохранение и лёг черновиком
 * поверх настоящей работы человека.
 */
export function толькоЧтение(
  path: () => string,
  блоки: Record<string, ОписаниеБлока>,
  названиеСовета: string,
): Extension[] {
  return [...чтениеСтатьи(path, блоки, названиеСовета), ...запретПравки()];
}

/** Сам запрет правки: на уровне состояния редактора, а не «мы просто не слушаем изменения». */
export function запретПравки(): Extension[] {
  return [EditorState.readOnly.of(true), EditorView.editable.of(false)];
}
