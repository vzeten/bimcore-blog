import {useEffect, useRef} from 'react';
import {EditorState} from '@codemirror/state';
import {EditorView} from '@codemirror/view';
import {толькоЧтение} from '../editor/reading';
import {Properties, parseFrontmatter} from './Properties';
import {время} from './VersionStrip';
import type {ПросмотрВерсии, Settings} from '../types';

/**
 * Просмотр старой версии: та же статья на вид, но менять нечего.
 * Отдельная зона, а не подмена текста в рабочем редакторе: подмена ушла бы в автосохранение
 * и черновик, то есть старая версия молча легла бы поверх несохранённой работы человека.
 */
export function VersionView(props: {
  settings: Settings;
  версия: ПросмотрВерсии;
  path: string;
  onЗакрыть: () => void;
}) {
  const host = useRef<HTMLDivElement | null>(null);
  const п = props.settings.подписи;

  useEffect(() => {
    if (!host.current) return;

    const view = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: props.версия.body,
        extensions: толькоЧтение(() => props.path),
      }),
    });

    return () => view.destroy();
  }, [props.версия.имя, props.path]);

  return (
    <div className="pane pane-read">
      <div className="version-bar">
        <span>{шапка(props.версия, props.settings)}</span>
        <button className="ghost" onClick={props.onЗакрыть}>{п.вернутьсяКТекущей}</button>
      </div>

      <div className="pane-head">
        <Properties
          settings={props.settings}
          fields={parseFrontmatter(props.версия.frontmatterRaw, props.path, props.settings.контент)}
          onChange={() => undefined}
          толькоЧтение
        />
      </div>

      <div className="paper" ref={host} />
    </div>
  );
}

function шапка(версия: ПросмотрВерсии, settings: Settings): string {
  // Формат времени один на ленту и просмотр: два разных вида одного и того же сбивали бы с толку.
  return settings.подписи.смотримВерсию
    .replace('{когда}', время(версия.когда, settings))
    .replace('{автор}', версия.автор);
}
