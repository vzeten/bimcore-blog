// Общие настройки для проверок создания статьи: правило одно, значит и настройки одни.
// Две копии разошлись бы в тот день, когда правило поменяется только в одном файле.

export const RU = 'i18n/ru/docusaurus-plugin-content-docs/current';
export const EN = 'docs';
export const ES = 'i18n/es/docusaurus-plugin-content-docs/current';

export const НАСТРОЙКИ = {
  основнойЯзык: 'ru',
  обязательныйЯзык: 'en',
  // Новая статья рождается скрытой: файлы попадают в репозиторий сразу, и недописанная
  // статья не должна оказаться в меню сайта. Значение — настройка, а не хардкод (SPEC 4.4).
  видимость: {новаяСкрыта: true},
  локали: {en: 'English', ru: 'Русский', es: 'Español'},
  статусы: ['Черновик', 'Готова к публикации', 'Опубликована'],
  хранение: {файлСостояния: '_state.json'},
  // Заглушка написана на языке своей страницы: английское извинение на испанском адресе —
  // та же подмена языка, только короче.
  заглушкиПеревода: {
    ru: {заголовок: 'Заглушка перевода:', тело: 'Перевод ещё не готов.', описание: 'Страница-заглушка.'},
    en: {заголовок: 'Translation placeholder:', тело: 'Placeholder.', описание: 'Placeholder page.'},
    es: {заголовок: 'Marcador de traducción:', тело: 'Marcador.', описание: 'Página marcador.'},
  },
  поляСоздания: {
    docs: {порядок: ['title', 'slug', 'sidebar_label', 'sidebar_position', 'description', 'image', 'unlisted'], значения: {description: ''}},
    blog: {порядок: ['title', 'slug', 'description', 'date', 'authors', 'tags', 'keywords', 'image', 'unlisted'], значения: {description: '', authors: '[ivan]', tags: '[]', keywords: '[]'}},
    проба: {порядок: ['title', 'slug', 'unlisted'], значения: {}},
  },
  контент: [
    {локаль: 'en', род: 'docs', папка: EN, наСайте: true},
    {локаль: 'en', род: 'blog', папка: 'blog', наСайте: true},
    {локаль: 'ru', род: 'docs', папка: RU, наСайте: true},
    {локаль: 'ru', род: 'blog', папка: 'i18n/ru/docusaurus-plugin-content-blog', наСайте: true},
    {локаль: 'es', род: 'docs', папка: ES, наСайте: true},
    {локаль: 'es', род: 'blog', папка: 'i18n/es/docusaurus-plugin-content-blog', наСайте: true},
    {локаль: 'ru', род: 'проба', папка: 'editor/sandbox', наСайте: false},
  ],
};
