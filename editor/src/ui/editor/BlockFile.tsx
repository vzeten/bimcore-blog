import {useEffect, useRef, useState} from 'react';
import {типыВидео} from '../../core/imageType.mjs';
import {выбратьФайл} from './images';

/** Границы блока в тексте статьи: после замены файла они у него другие. */
export interface УзелБлока {
  текст: string;
  from: number;
  to: number;
}

/**
 * Файл блока и его замена: имя для подписи и сама замена. Она возвращает новые границы тега и
 * имя файла либо `null` — замены не было, причина уже показана человеку в строке сообщений.
 */
export interface ФайлБлока {
  имя: string;
  заменить: (file: File, узел: УзелБлока, передПравкой: () => void) => Promise<{узел: УзелБлока; имяФайла: string} | null>;
}

/**
 * Строка файла в панели свойств блока: имя файла и кнопка замены — как у картинки, одной строкой
 * над свойствами. Пока едет замена, кнопка заперта: второй выбор поверх первого устроил бы гонку.
 * Границы тега и имя файла после замены берутся у самой замены: импорт выше стал другой длины,
 * и старые границы указывали бы мимо тега. Отдельный файл от панели по размеру (SPEC 4.9).
 */
export function BlockFile(props: {
  файл: ФайлБлока;
  подписи: Record<string, string>;
  /** Живые границы тега: панель правит его после каждой записи, и брать их надо в момент замены. */
  узел: () => УзелБлока;
  onСвояПравка: () => void;
  onЗамена: (узел: УзелБлока) => void;
}) {
  const [имяФайла, setИмяФайла] = useState(props.файл.имя);
  const [занято, setЗанято] = useState(false);
  // Поздний ответ замены не трогает снятую с экрана панель. Признак взводится в эффекте, а не в
  // начальном значении ref: StrictMode монтирует эффект дважды (правило панели картинки).
  const жив = useRef(true);
  useEffect(() => {
    жив.current = true;
    return () => {
      жив.current = false;
    };
  }, []);

  return (
    <div className="block-panel-file">
      <span className="block-panel-file-name" title={имяФайла}>{имяФайла}</span>
      <button onClick={() => выбратьФайл(типыВидео(), (file) => void заменить(file))} disabled={занято}>
        {занято ? props.подписи.картинкаЗаменяю : props.подписи.картинкаЗаменитьФайл}
      </button>
    </div>
  );

  async function заменить(file: File): Promise<void> {
    if (занято) return;
    setЗанято(true);
    try {
      const итог = await props.файл.заменить(file, props.узел(), props.onСвояПравка);
      if (!жив.current || итог === null) return;
      props.onЗамена(итог.узел);
      setИмяФайла(итог.имяФайла);
    } finally {
      if (жив.current) setЗанято(false);
    }
  }
}

/**
 * Признак тега (`muted`, `loop`) флажком: стоит — включён. Записывается сразу по нажатию — тут
 * нечего дописывать, — и панель остаётся открытой: рядом второй флажок и название.
 */
export function Флажок(props: {включён: boolean; onChange: (включён: boolean) => void}) {
  return <input type="checkbox" checked={props.включён} onChange={(event) => props.onChange(event.target.checked)} />;
}
