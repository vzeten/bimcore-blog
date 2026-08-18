// Связка окна со сменой формата картинки: сервер переписал файл статьи (ссылка на картинку
// нового формата), и окну нужны новые тело и отпечаток — иначе следующее сохранение увидело бы
// ложный конфликт «файл изменён снаружи». Вынесено из окна отдельным правилом (SPEC 4.9).

import type {Dispatch, MutableRefObject, SetStateAction} from 'react';
import type {Article} from './types';

export function makeСсылкаОбновлена(deps: {
  текстСейчас: MutableRefObject<string>;
  setText: (текст: string) => void;
  setArticle: Dispatch<SetStateAction<Article | null>>;
}): (данные: {текст: string; отпечаток: string}) => void {
  return ({текст, отпечаток}) => {
    deps.текстСейчас.current = текст;
    deps.setText(текст);
    // Тело файла и отпечаток сдвигаются вместе: цвет слоёв считается от тела файла,
    // а отпечаток — пропуск следующего сохранения.
    deps.setArticle((было) => (было ? {...было, body: текст, телоФайла: текст, отпечаток} : было));
  };
}
