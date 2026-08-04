// Надписи для тех кусков интерфейса, куда настройки не доходят параметром:
// виджеты CodeMirror создаются самим редактором, и передать им настройки неоткуда.
// Заполняется один раз при запуске программы.

let подписи: Record<string, string> = {};

export function setLabels(next: Record<string, string>): void {
  подписи = next;
}

/** Подпись по имени. Подстановки пишутся в настройках фигурными скобками: `{килобайт}`. */
export function label(key: string, values: Record<string, string | number> = {}): string {
  const text = подписи[key] ?? key;
  return Object.entries(values).reduce((out, [name, value]) => out.split(`{${name}}`).join(String(value)), text);
}
