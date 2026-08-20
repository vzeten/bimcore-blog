// Имя каждого теста повторяет формулировку правила.
// Вход в отсутствующую локаль со стороны окна: чей это вопрос и что уходит на сервер.
import {describe, expect, it, vi} from 'vitest';

import {startLocale} from '../src/ui/actions';
import {провестиНачало, вопросОкна} from '../src/ui/useLocaleStart';
import {setLabels} from '../src/ui/labels';

setLabels({версияНачата: 'Версия начата'});

/** Ход начала версии, где всё удаётся. Каждый тест ломает ровно один шаг. */
const ход = (правки: Partial<Parameters<typeof провестиНачало>[0]> = {}) => ({
  путь: 'i18n/ru/x/lessons/a/index.mdx',
  локаль: 'es',
  окноБыло: 'статья|0',
  окноСейчас: () => 'статья|0',
  сохранить: vi.fn().mockResolvedValue(true),
  обновить: vi.fn().mockResolvedValue(undefined),
  открыть: vi.fn().mockResolvedValue(true),
  запрос: vi.fn().mockResolvedValue({path: 'i18n/es/x/lessons/a/index.mdx'}),
  onОшибка: vi.fn(),
  onНачато: vi.fn(),
  ...правки,
});

describe('ход начала языковой версии', () => {
  it('несохранённая правка ложится на диск ДО запроса: иначе сосед родится от старого названия', async () => {
    // Название и адрес новой версии сервер берёт из файла исходной, а не из окна.
    const порядок: string[] = [];
    const шаги = ход({
      сохранить: vi.fn().mockImplementation(async () => {
        порядок.push('сохранение');
        return true;
      }),
      запрос: vi.fn().mockImplementation(async () => {
        порядок.push('запрос');
        return {path: 'i18n/es/x/lessons/a/index.mdx'};
      }),
    });

    await провестиНачало(шаги);

    expect(порядок).toEqual(['сохранение', 'запрос']);
  });

  it('окно не легло на диск — не создаётся ничего: на сервер запрос не уходит', async () => {
    const шаги = ход({сохранить: vi.fn().mockResolvedValue(false)});

    await провестиНачало(шаги);

    expect(шаги.запрос).not.toHaveBeenCalled();
    expect(шаги.onНачато).not.toHaveBeenCalled();
  });

  it('ушли в другую статью, пока шёл запрос, — окно человека не трогается', async () => {
    // Версия создана, но открывать её значит увести человека от того, что он уже читает.
    const шаги = ход({окноСейчас: () => 'другая|0'});

    await провестиНачало(шаги);

    expect(шаги.открыть).not.toHaveBeenCalled();
    expect(шаги.onНачато).not.toHaveBeenCalled();
  });

  it('переход не состоялся — про открытую версию не рассказывается', async () => {
    // Иначе «версия открыта» встало бы поверх настоящей причины отказа.
    const шаги = ход({открыть: vi.fn().mockResolvedValue(false)});

    await провестиНачало(шаги);

    expect(шаги.onНачато).not.toHaveBeenCalled();
  });

  it('всё удалось — человеку сказано словами, что версия начата', async () => {
    const шаги = ход();

    await провестиНачало(шаги);

    expect(шаги.onНачато).toHaveBeenCalledWith('Версия начата');
  });

  it('сервер отказал — говорится причина, и успех не подтверждается', async () => {
    const шаги = ход({запрос: vi.fn().mockRejectedValue(new Error('эта версия уже есть'))});

    await провестиНачало(шаги);

    expect(шаги.onОшибка).toHaveBeenCalledWith('эта версия уже есть');
    expect(шаги.открыть).not.toHaveBeenCalled();
    expect(шаги.onНачато).not.toHaveBeenCalled();
  });

  it('реестр перечитывается после создания: версии в его списке ещё нет', async () => {
    const шаги = ход();

    await провестиНачало(шаги);

    expect(шаги.обновить).toHaveBeenCalled();
  });
});

describe('вопрос о начале языковой версии', () => {
  it('вопрос показывается в том окне, где его задали', () => {
    expect(вопросОкна({локаль: 'es', окно: 'статья|0'}, 'статья|0')).toBe('es');
  });

  it('ушли в другую статью — вопрос не переезжает на неё вместе с человеком', () => {
    // Иначе «Начать версию» завело бы файл у соседа, которого человек об этом не просил.
    expect(вопросОкна({локаль: 'es', окно: 'первая|0'}, 'вторая|0')).toBe(null);
  });

  it('та же статья, открытая заново, — уже другое окно, и вопрос в нём не висит', () => {
    expect(вопросОкна({локаль: 'es', окно: 'статья|0'}, 'статья|1')).toBe(null);
  });

  it('вопрос не задан — начинать нечего', () => {
    expect(вопросОкна(null, 'статья|0')).toBe(null);
  });
});

describe('запрос начала языковой версии', () => {
  it('окно называет серверу только статью и язык: путь новой версии считает он сам', async () => {
    // Прими сервер путь готовым от окна — запись пошла бы туда, куда скажет клиент.
    const request = vi.fn().mockResolvedValue({path: 'i18n/es/x/index.mdx'});

    await startLocale({path: 'docs/lessons/a/index.mdx', локаль: 'es'}, {ok: vi.fn(), fail: vi.fn()}, request as never);

    const посланное = JSON.parse((request.mock.calls[0][1] as {body: string}).body);
    expect(посланное).toEqual({path: 'docs/lessons/a/index.mdx', локаль: 'es'});
  });

  it('при отказе сервера успех не подтверждается: версии нет, и делать вид нельзя', async () => {
    const request = vi.fn().mockRejectedValue(new Error('эта версия уже есть'));
    const ok = vi.fn();
    const fail = vi.fn();

    await startLocale({path: 'docs/lessons/a/index.mdx', локаль: 'en'}, {ok, fail}, request as never);

    expect(ok).not.toHaveBeenCalled();
    expect(fail).toHaveBeenCalledWith('эта версия уже есть');
  });
});
