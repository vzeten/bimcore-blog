// Владелец и имя репозитория на GitHub по адресу удалённого (`git remote get-url`). Из адреса, а не
// из кода: программа не знает, чей это сайт, и зашитое имя однажды молча следило бы за чужим.
//
// Чистое правило: строка на входе, `{владелец, имя}` либо `null` на выходе. Учебный git (голый
// репозиторий в папке), чужой сервер и непонятная запись — `null`: выкладку там не видно, и окно
// говорит это словами, а не делает вид, что следит.

/** Хост GitHub. Чужой формат — так называется сервер, — поэтому в коде (SPEC 4.4). */
const GITHUB = 'github.com';

/**
 * Разобрать адрес удалённого. Понимаются обе обычные формы GitHub: `https://github.com/o/r(.git)` и
 * `git@github.com:o/r(.git)` (а также `ssh://git@github.com/o/r`). Остальное — `null`.
 */
export function имяНаGitHub(адрес) {
  const строка = String(адрес ?? '').trim();
  if (строка === '') return null;

  const scp = /^[\w.-]+@([^:/]+):([^/]+)\/([^/]+?)(?:\.git)?\/?$/.exec(строка);
  if (scp) return scp[1].toLowerCase() === GITHUB ? годное(scp[2], scp[3]) : null;

  let url;
  try {
    url = new URL(строка);
  } catch {
    return null;
  }
  if (!['https:', 'http:', 'ssh:', 'git:'].includes(url.protocol) || url.hostname.toLowerCase() !== GITHUB) return null;
  const части = url.pathname.replace(/^\/+|\/+$/g, '').replace(/\.git$/, '').split('/');
  return части.length === 2 ? годное(части[0], части[1]) : null;
}

/** Имена GitHub — латиница, цифры, точка, дефис, подчёркивание. Иное — не GitHub, а ошибка записи. */
function годное(владелец, имя) {
  const можно = /^[A-Za-z0-9_.-]+$/;
  return можно.test(владелец) && можно.test(имя) ? {владелец, имя} : null;
}
