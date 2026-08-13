import {useState} from 'react';
import type {Выпуск} from '../useRelease';
import type {Settings} from '../types';

/**
 * Панель предварительного выпуска: что уедет на сайт и что сказала полная сборка.
 *
 * Перечень файлов показывается ДО запуска сборки: человек сначала видит состав, а потом уже ждёт
 * проверку. У каждой строки названа причина включения — иначе список путей ничего не объясняет.
 *
 * Git этой панелью не трогается вовсе: кнопка подтверждения появится следующим шагом.
 */
export function ReleasePanel(props: {settings: Settings; выпуск: Выпуск}) {
  const [вывод, setВывод] = useState(false);
  const в = props.settings.выпуск;
  const {состав, сборка, шаг, ошибка} = props.выпуск;

  if (шаг === 'нет' && состав === null && ошибка === null) return null;

  return (
    <section className="release" aria-label={в.заголовок}>
      <div className="prepare-head">
        <strong>{ошибка ?? в.заголовок}</strong>
        <button className="ghost" onClick={props.выпуск.закрыть}>{в.закрыть}</button>
      </div>

      {шаг === 'состав' && <p className="prepare-skipped">{в.считаюСостав}</p>}

      {состав && (
        <ul className="prepare-list">
          {состав.файлы.map((файл) => (
            <li key={файл.путь} className="prepare-item">
              <span className="prepare-level">{в.назначения[файл.назначение] ?? файл.назначение}</span>
              <span className="prepare-text">{файл.путь}</span>
              {файл.локаль && <span className="prepare-where">{файл.локаль}</span>}
            </li>
          ))}
          {состав.разрывы.map((разрыв, номер) => (
            <li key={`разрыв|${номер}`} className="prepare-item prepare-block">
              <span className="prepare-level">{в.заголовок}</span>
              <span className="prepare-text">{в.разрывы[разрыв.причина] ?? разрыв.причина}</span>
              {разрыв.путь && <span className="prepare-where">{разрыв.путь}</span>}
            </li>
          ))}
        </ul>
      )}

      {шаг === 'сборка' && <p className="prepare-skipped">{в.сборкаИдёт}</p>}

      {сборка && (
        <div className="release-build">
          <p className={сборка.зелёная ? 'release-ok' : 'release-fail'}>
            {итог(сборка, в)}
          </p>

          {/* Подтверждение и коммит — следующий шаг: git этот срез не трогает вовсе. */}
          {сборка.зелёная && (
            <button className="ghost" disabled title={в.скороПодтверждение}>{в.подтвердить}</button>
          )}

          {/* Разбирать вывод сборщика в находки программа не берётся, но и прятать его нельзя:
              без исходного вывода причину чужой поломки не найти. */}
          {!сборка.зелёная && (
            <>
              <button className="ghost" onClick={() => setВывод(!вывод)}>
                {вывод ? в.спрятатьВывод : в.выводСборки}
              </button>
              {вывод ? <pre className="release-log">{сборка.вывод}</pre> : <pre className="release-log">{сборка.причина}</pre>}
            </>
          )}
        </div>
      )}

      {состав?.можно && !сборка && <p className="prepare-skipped">{в.быстрыхПроверокМало}</p>}
    </section>
  );
}

/** Итог сборки словом: зелёная, упавшая или оборванная по времени — это три разных ответа. */
function итог(сборка: {зелёная: boolean; оборвана: boolean}, в: Settings['выпуск']): string {
  if (сборка.зелёная) return в.сборкаЗелёная;

  return сборка.оборвана ? в.сборкаОборвана : в.сборкаКрасная;
}
