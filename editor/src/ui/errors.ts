import {label} from './labels';

/**
 * Показ ошибок окна в одном месте: как выполнить действие, не считая его успешным при сбое,
 * и как собрать текст «что не вышло» + причина от сервера.
 * Вынесено из App, чтобы правило показа ошибок не размазывалось по обработчикам.
 */
export function makeReporter(setОшибка: (текст: string | null) => void) {
  /** Общий текст ошибки + причина от сервера, чтобы человек видел, что именно не вышло. */
  const сПричиной = (ключ: string, reason: string, хвост?: string): string => {
    const начало = reason ? `${label(ключ)}: ${reason}` : label(ключ);
    return хвост ? `${начало}. ${label(хвост)}` : начало;
  };

  /** Выполняет действие и при сбое спокойно показывает причину, не считая действие успешным. */
  const runSafe = async (action: () => Promise<void>, contextKey?: string): Promise<boolean> => {
    try {
      await action();
      return true;
    } catch (error) {
      const текст = contextKey
        ? label(contextKey)
        : (error instanceof Error ? error.message : label('ошибкаЗапроса'));
      setОшибка(текст);
      return false;
    }
  };

  return {runSafe, сПричиной};
}
