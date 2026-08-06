import {useState} from 'react';
import {readFields, writeFields} from '../../core/frontmatterFields.mjs';
import type {Root, Settings} from '../types';

/** Поле шапки в человеческом виде: списки без скобок, строки без кавычек, адрес короткий. */
export interface Field {
  key: string;
  raw: string;
  kind: string;
  display: string;
}

/** Свойства статьи стоят над текстом и по умолчанию свёрнуты: нужны раз на статью. */
export function Properties(props: {
  settings: Settings;
  fields: Field[];
  onChange: (fields: Field[]) => void;
  /** Просмотр старой версии: шапка видна, но правке не подлежит — менять можно только текущую работу. */
  толькоЧтение?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <section className="props">
      <button className="props-head" onClick={() => setOpen(!open)}>
        <span className="props-sign">{open ? '−' : '+'}</span>
        {props.settings.подписи.свойства}
        <span className="props-count">{props.fields.length}</span>
      </button>

      {open && (
        <div className="props-grid">
          {props.fields.map((field, index) => (
            <label key={field.key}>
              {/* Человеку — понятная подпись; техническое имя остаётся подсказкой при наведении. */}
              <span title={field.key}>{props.settings.подписиПолей[field.key] ?? field.key}</span>
              <input
                value={field.display}
                readOnly={props.толькоЧтение === true}
                onChange={(event) => {
                  const next = [...props.fields];
                  next[index] = {...field, display: event.target.value};
                  props.onChange(next);
                }}
              />
            </label>
          ))}
        </div>
      )}
    </section>
  );
}

/** Разбор шапки в человеческие поля. Путь и корни нужны для короткого адреса. */
export function parseFrontmatter(raw: string, path: string, roots: Root[]): Field[] {
  return readFields(raw, path, roots) as Field[];
}

/** Сборка обратно: нетронутые поля возвращаются дословно. */
export function buildFrontmatter(raw: string, fields: Field[], path: string, roots: Root[]): string {
  return writeFields(raw, fields, path, roots);
}
