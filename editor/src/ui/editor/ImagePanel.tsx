import {useEffect, useRef, useState} from 'react';
import {Transaction} from '@codemirror/state';
import type {EditorView} from '@codemirror/view';
import {imageAlt, imageSrc, shownAlt} from '../../core/commands';
import {адресНовогоФормата, номерВхождения} from '../../core/imageFormat.mjs';
import {картинкаЗаменена, правкаПанелиКартинки, type КартинкаВОкне} from '../livePreview/inline';
import {uploadReplacement, uploadReformat} from './images';
import type {Settings} from '../types';

/**
 * Панель свойств картинки: встаёт у самой картинки, картинка при этом не исчезает и текст
 * не смещается (слово владельца 2026-08-16). Показывает alt-текст (на сайте он под картинкой
 * не виден — подписи там нет вовсе, слово владельца 2026-08-17) и меняет файл: тот же формат —
 * замена байтов, другой формат JPG↔PNG — новый файл, новое расширение и обновлённая ссылка.
 *
 * Панель держит позицию узла на момент открытия, поэтому живёт только до первой правки текста:
 * родитель закрывает её при любом `docChanged`. Применение своей правки закрывает её само.
 */
export function ImagePanel(props: {
  settings: Settings;
  картинка: КартинкаВОкне;
  view: EditorView;
  articlePath: string;
  /** Текст окна совпадает с файлом: без этого смена формата не начинается. */
  сохранено: boolean;
  /** Отпечаток файла статьи с последнего сохранения — доказательство «правим то, что видим». */
  отпечаток: string;
  /** Файл статьи изменён сервером: окну нужны новые тело и отпечаток. */
  ссылкаОбновлена: (данные: {текст: string; отпечаток: string}) => void;
  /** Идёт файловая операция: родитель на это время не закрывает панель правкой текста. */
  onЗанято: (идёт: boolean) => void;
  onClose: () => void;
}) {
  const п = props.settings.подписи;
  const [alt, setAlt] = useState(() => shownAlt(props.картинка.alt));
  const [занято, setЗанято] = useState(false);
  const [итог, setИтог] = useState<string | null>(null);
  const [ошибка, setОшибка] = useState<string | null>(null);
  /** Файл другого формата выбран и ждёт отдельного согласия человека. */
  const [ждётСогласия, setЖдётСогласия] = useState<File | null>(null);

  // Поздний ответ замены не должен трогать состояние снятой с экрана панели: человек мог
  // закрыть её или уйти из статьи, пока файл ехал на сервер. Признак взводится в самом эффекте,
  // а не в начальном значении ref: StrictMode в разработке монтирует эффект дважды, и без этого
  // признак навсегда остался бы снятым после первой пробной размонтировки.
  const жив = useRef(true);
  useEffect(() => {
    жив.current = true;
    return () => {
      жив.current = false;
      // Снятая панель не должна оставить родителю взведённый признак файловой операции.
      props.onЗанято(false);
    };
  }, []);

  // Замена и смена формата разрешены только JPG и PNG (решение владельца): GIF обязан
  // сохранить анимацию, и его замена — отдельная работа. Формат виден по имени в тексте;
  // содержимое нового файла сервер проверяет сам, по байтам.
  const формат = (props.картинка.src.split('.').pop() ?? '').toLowerCase().replace('jpeg', 'jpg');
  const заменяемая = формат === 'jpg' || формат === 'png';
  const имяФайла = props.картинка.src.replace(/^\.\//, '');

  return (
    <div className="image-panel" style={положение(props.картинка)}>
      <div className="image-panel-head">
        <div className="image-panel-file">{имяФайла}</div>
        {/* Пока замена идёт, закрыть панель нельзя: человек остался бы без итога,
            хотя файл на сервере уже меняется (находка ворот 2026-08-16). */}
        <button className="image-panel-close" onClick={props.onClose} disabled={занято} title={п.картинкаЗакрыть}>✕</button>
      </div>

      <label className="image-panel-alt">
        <span>{п.картинкаПодпись}</span>
        <input
          value={alt}
          onChange={(event) => setAlt(event.target.value)}
          onKeyDown={(event) => {
            if (занято) return;
            if (event.key === 'Enter') применить();
            if (event.key === 'Escape') props.onClose();
          }}
          title={п.картинкаПодписьПодсказка}
          disabled={занято}
        />
      </label>

      {ошибка !== null && <div className="image-panel-error">{ошибка}</div>}
      {итог !== null && <div className="image-panel-done">{итог}</div>}

      {ждётСогласия !== null ? (
        <>
          <div className="image-panel-ask">
            {п.сменаФормата
              .replace('{формат}', форматФайла(ждётСогласия).toUpperCase())
              .replace('{адрес}', адресНовогоФормата(props.картинка.src, форматФайла(ждётСогласия)) ?? '')}
          </div>
          <div className="image-panel-actions">
            <button onClick={() => setЖдётСогласия(null)} disabled={занято}>{п.неСменитьФормат}</button>
            <button onClick={() => void сменитьФормат(ждётСогласия)} disabled={занято}>{п.даСменитьФормат}</button>
          </div>
        </>
      ) : (
        <div className="image-panel-actions">
          <button onClick={заменяемая ? заменить : undefined} disabled={занято || !заменяемая}
            title={заменяемая ? undefined : п.картинкаТолькоJpgPng}>
            {занято ? п.картинкаЗаменяю : п.картинкаЗаменитьФайл}
          </button>
          <button onClick={применить} disabled={занято}>{п.картинкаПрименить}</button>
        </div>
      )}
    </div>
  );

  /**
   * Записать alt-текст и закрыть панель. Неизменённый alt не рождает никакой транзакции:
   * текст статьи не переписывается без действия человека (правило в `imageAlt`).
   */
  function применить(): void {
    const {from, to, src} = props.картинка;
    const узел = props.view.state.sliceDoc(from, to);
    const правка = imageAlt(узел, from, alt, src);
    // Правка от человека (уходит в автосохранение как обычная), но помечена как правка панели:
    // закрывает панель не общий сторож, а следующая строка — сама.
    if (правка) {
      props.view.dispatch({
        changes: {from: правка.from, to: правка.to, insert: правка.insert},
        annotations: [правкаПанелиКартинки.of(true)],
      });
    }
    props.onClose();
  }

  /** Выбрать файл. Тот же формат — замена байтов; другой JPG↔PNG — отдельное согласие человека. */
  function заменить(): void {
    const picker = document.createElement('input');
    picker.type = 'file';
    // Предлагаются оба формата: смена JPG↔PNG теперь входит в работу (слово владельца 2026-08-17).
    picker.accept = 'image/jpeg,image/png';

    picker.onchange = () => {
      const file = picker.files?.[0];
      if (!file) return;

      if (форматФайла(file) === формат) {
        void заменитьТемЖе(file);
        return;
      }
      // Смена формата меняет и файл, и ссылку в тексте — без сохранённого текста серверу
      // не с чем сверять то, что видит человек.
      if (!props.сохранено) {
        setОшибка(п.сохранитеПередСменой);
        return;
      }
      setОшибка(null);
      setИтог(null);
      setЖдётСогласия(file);
    };

    picker.click();
  }

  /** Запереть панель на время файловой операции — и сказать родителю, чтобы не закрывал её. */
  function занятость(идёт: boolean): void {
    setЗанято(идёт);
    props.onЗанято(идёт);
  }

  /** Замена байтов под прежним именем: имя, путь и ссылка в тексте остаются как были. */
  async function заменитьТемЖе(file: File): Promise<void> {
    // Кнопка заперта на время запроса: второй выбор файла параллельно первому устроил бы
    // гонку «последняя запись против последнего ответа».
    занятость(true);
    setОшибка(null);
    setИтог(null);

    try {
      const ответ = await uploadReplacement(props.articlePath, props.картинка.src, file);

      // Показ обновляется и тогда, когда панель уже снята правкой текста: файл на сервере
      // заменён, и прежняя картинка на экране была бы неправдой (находка ворот 2026-08-16).
      // Не обновляется он только вместе со смертью самого редактора — при уходе из статьи.
      if (props.view.dom.isConnected) {
        props.view.dispatch({effects: картинкаЗаменена.of({src: props.картинка.src, токен: токенЗамены()})});
      }

      if (!жив.current) return;
      setИтог(`${п.картинкаЗаменена}.${хвостВеса(ответ.тяжёлая, ответ.килобайт)}`);
    } catch (error) {
      if (!жив.current) return;
      setОшибка(error instanceof Error ? error.message : п.ошибкаЗамены);
    } finally {
      if (жив.current) занятость(false);
    }
  }

  /** Смена формата: новый файл, новое расширение, обновлённая ссылка — после согласия человека. */
  async function сменитьФормат(file: File): Promise<void> {
    занятость(true);
    setОшибка(null);
    setИтог(null);

    const {from, to, src} = props.картинка;
    const состояние = props.view.state;
    const узел = состояние.sliceDoc(from, to);
    const текстБыл = состояние.doc.toString();

    try {
      const ответ = await uploadReformat({
        article: props.articlePath,
        src,
        узел,
        номер: номерВхождения(текстБыл, узел, from),
        отпечаток: props.отпечаток,
        file,
      });

      // Файл статьи на диске уже новый. Окно повторяет ту же правку у себя — но только если
      // его текст не менялся: иначе правка легла бы не туда, а расхождение с диском честно
      // поймает существующий заслон сохранения (конфликт отпечатков).
      const текстСовпал = props.view.state.doc.toString() === текстБыл;
      if (props.view.dom.isConnected && текстСовпал
        && ответ.новыйSrc !== undefined && ответ.отпечаток !== undefined) {
        const правка = imageSrc(узел, from, src, ответ.новыйSrc);
        if (правка) {
          // Правка не от человека и вне истории отмены: Ctrl+Z иначе вернул бы ссылку
          // на файл, которого на диске уже нет, и статья сохранилась бы битой.
          props.view.dispatch({
            changes: {from: правка.from, to: правка.to, insert: правка.insert},
            annotations: [Transaction.remote.of(true), Transaction.addToHistory.of(false), правкаПанелиКартинки.of(true)],
            effects: картинкаЗаменена.of({src: ответ.новыйSrc, токен: токенЗамены()}),
          });
          props.ссылкаОбновлена({текст: props.view.state.doc.toString(), отпечаток: ответ.отпечаток});
        }
      }

      if (!жив.current) return;
      setЖдётСогласия(null);
      // Человек успел поправить текст, пока файл ехал: диск обновлён, окно — нет, и выдать это
      // за обычный успех нельзя (находка ворот 2026-08-17).
      if (!текстСовпал) {
        setИтог(п.сменаПриПравке);
        return;
      }
      const хвостСтарого = ответ.старыйОставлен === 'ссылки' ? ` ${п.старыйФайлОстался}`
        : ответ.старыйОставлен === 'сбой' ? ` ${п.старыйФайлНеУбран}` : '';
      setИтог(`${п.форматСменён}.${хвостСтарого}${хвостВеса(ответ.тяжёлая, ответ.килобайт)}`);
    } catch (error) {
      if (!жив.current) return;
      setОшибка(error instanceof Error ? error.message : п.ошибкаЗамены);
      setЖдётСогласия(null);
    } finally {
      if (жив.current) занятость(false);
    }
  }

  function хвостВеса(тяжёлая: boolean | undefined, килобайт: number | undefined): string {
    if (тяжёлая !== true) return '';
    return ` ${п.тяжёлаяКартинка.replace('{килобайт}', String(килобайт ?? 0))}`;
  }
}

/** Формат выбранного файла по типу браузера; сервер всё равно проверит по байтам. */
function форматФайла(file: File): string {
  return (file.type.split('/')[1] ?? '').replace('jpeg', 'jpg');
}

/**
 * Токен уникален у каждой замены: счётчик после перезапуска программы начался бы заново
 * и совпал бы с тем, что уже лежит в кэше браузера.
 */
function токенЗамены(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Панель встаёт у левого верхнего угла картинки и не выходит за края окна. */
function положение(картинка: КартинкаВОкне): {left: number; top: number} {
  return {
    left: Math.max(8, Math.min(картинка.left + 8, window.innerWidth - 300)),
    top: Math.max(8, Math.min(картинка.top + 8, window.innerHeight - 200)),
  };
}
