// Как показывается статья: одно правило на оба случая — правку и просмотр старой версии.
// Держать два списка расширений нельзя: тогда «читается как статья» пришлось бы чинить дважды.

import {EditorState, type Extension} from '@codemirror/state';
import {EditorView} from '@codemirror/view';
import {markdown} from '@codemirror/lang-markdown';
import {livePreview} from '../livePreview';
import type {КартинкаВОкне} from '../livePreview/inline';

/**
 * Общий показ: разметка, перенос строк, живой вид блоков. Путь нужен живому показу картинок.
 * `onImage` — нажатие по картинке; просмотр версии его не передаёт, и там нажатие молчит:
 * панель свойств правит текст, а в просмотре разрешено только чтение.
 */
export function чтениеСтатьи(path: () => string, onImage?: (картинка: КартинкаВОкне) => void): Extension[] {
  return [markdown(), EditorView.lineWrapping, livePreview(path, onImage)];
}

/**
 * Просмотр версии: тот же вид, но менять нечего.
 * Запрет именно на уровне состояния редактора, а не «мы просто не слушаем правки»:
 * иначе набранный в старой версии текст ушёл бы в автосохранение и лёг черновиком
 * поверх настоящей работы человека.
 */
export function толькоЧтение(path: () => string): Extension[] {
  return [...чтениеСтатьи(path), ...запретПравки()];
}

/** Сам запрет правки: на уровне состояния редактора, а не «мы просто не слушаем изменения». */
export function запретПравки(): Extension[] {
  return [EditorState.readOnly.of(true), EditorView.editable.of(false)];
}
