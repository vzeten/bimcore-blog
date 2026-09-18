// Имя каждого теста повторяет формулировку правила.
// Владелец и имя репозитория GitHub берутся из адреса удалённого, а не из кода (решение владельца
// 2026-09-18, п.5б). Учебный git — папка — выкладку не показывает.
import {describe, expect, it} from 'vitest';

import {имяНаGitHub} from '../src/core/remoteName.mjs';

describe('репозиторий на GitHub по адресу удалённого', () => {
  it('адрес https — с .git и без, с косой на конце', () => {
    expect(имяНаGitHub('https://github.com/vzeten/bimcore-blog.git')).toEqual({владелец: 'vzeten', имя: 'bimcore-blog'});
    expect(имяНаGitHub('https://github.com/vzeten/bimcore-blog')).toEqual({владелец: 'vzeten', имя: 'bimcore-blog'});
    expect(имяНаGitHub('https://github.com/vzeten/bimcore-blog/\n')).toEqual({владелец: 'vzeten', имя: 'bimcore-blog'});
  });

  it('адрес git@ и ssh://', () => {
    expect(имяНаGitHub('git@github.com:vzeten/bimcore-blog.git')).toEqual({владелец: 'vzeten', имя: 'bimcore-blog'});
    expect(имяНаGitHub('ssh://git@github.com/vzeten/bimcore-blog.git')).toEqual({владелец: 'vzeten', имя: 'bimcore-blog'});
  });

  it('путь к папке (учебный git), чужой сервер и мусор — не GitHub', () => {
    expect(имяНаGitHub('C:\\Users\\x\\сайт.git')).toBeNull();
    expect(имяНаGitHub('/tmp/editor-pub-1/origin.git')).toBeNull();
    expect(имяНаGitHub('file:///C:/сайт.git')).toBeNull();
    expect(имяНаGitHub('https://gitlab.com/vzeten/bimcore-blog.git')).toBeNull();
    expect(имяНаGitHub('git@gitlab.com:vzeten/bimcore-blog.git')).toBeNull();
    expect(имяНаGitHub('https://github.com/vzeten')).toBeNull();
    expect(имяНаGitHub('')).toBeNull();
  });
});
