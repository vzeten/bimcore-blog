// Значки панели. Своей картинкой рисуются нарочно: шрифтовые символы и эмодзи на разных машинах
// выглядят по-разному и ломают ровную высоту строки, а состояние экземпляра человек читает
// прежде всего глазом.

interface Свойства {
  className?: string;
}

/** Работает: залитый кружок. */
export function ЗначокЖив(props: Свойства) {
  return (
    <svg className={props.className} viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <circle cx="8" cy="8" r="5" fill="currentColor" />
    </svg>
  );
}

/** Остановлен: пустой кружок — место есть, но никого нет. */
export function ЗначокТихо(props: Свойства) {
  return (
    <svg className={props.className} viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <circle cx="8" cy="8" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

/** Препятствие: восклицание в треугольнике. */
export function ЗначокПрепятствие(props: Свойства) {
  return (
    <svg className={props.className} viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path d="M8 2.2 15 14H1z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M8 6.4v3.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="8" cy="11.8" r="0.9" fill="currentColor" />
    </svg>
  );
}

/** Открыть: стрелка наружу. */
export function ЗначокОткрыть(props: Свойства) {
  return (
    <svg className={props.className} viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path d="M9 2.5h4.5V7" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13 3 7.5 8.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M12 9.5v3.2a.8.8 0 0 1-.8.8H3.3a.8.8 0 0 1-.8-.8V4.8a.8.8 0 0 1 .8-.8h3.2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Запустить: треугольник пуска. */
export function ЗначокЗапустить(props: Свойства) {
  return (
    <svg className={props.className} viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path d="M4.5 3.2 12.5 8l-8 4.8z" fill="currentColor" />
    </svg>
  );
}

/** Остановить: квадрат. */
export function ЗначокОстановить(props: Свойства) {
  return (
    <svg className={props.className} viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <rect x="4" y="4" width="8" height="8" rx="1.2" fill="currentColor" />
    </svg>
  );
}

/** Обновить: круговая стрелка. */
export function ЗначокОбновить(props: Свойства) {
  return (
    <svg className={props.className} viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path d="M13 8a5 5 0 1 1-1.6-3.7" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M13.2 2.2v3h-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
