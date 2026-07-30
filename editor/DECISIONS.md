# Решения редактора статей

Этот файл фиксирует решения, которые должны пережить удаление старой CMS. Каждое правило ниже перенесено из `static/admin/index.html` или `static/admin/config.yml` перед удалением `static/admin`.

## 2026-07-30: перенесены защитные правила старой CMS

| Правило | Зачем нужно | Где должно жить в новом редакторе | Проверка |
|---|---|---|---|
| Пустое или пробельное поле `image` удаляется из frontmatter целиком. | Docusaurus валидирует `image` как URI; `image: ''` роняет сборку всего сайта. Если ключа нет, работает общий `og:image` из `docusaurus.config.js`. | `editor/src/domain/frontmatter/normalizeArticleFrontmatter.ts` | Тест: frontmatter с `image: ''` и `image: '   '` сохраняется без ключа `image`. |
| Для docs-статей относительный `slug` превращается в абсолютный URL с префиксом категории. | Автор вводит короткий slug, а Docusaurus docs требует абсолютный путь, иначе возможны двойные URL. | `editor/src/domain/articles/normalizeSlug.ts` | Тест: `docs/help/foo/index.mdx` + `slug: install-plugin` -> `/help/install-plugin`. |
| Для blog-статей `slug` остаётся относительным. | Blog-плагин Docusaurus сам строит URL; абсолютный slug для blog не нужен. | `editor/src/domain/articles/normalizeSlug.ts` | Тест: `blog/post/index.mdx` + `slug: my-post` остаётся `my-post`. |
| Для i18n docs путь локали не должен попадать в `slug`. | EN/RU/ES статьи должны иметь общий slug; локаль добавляет сам Docusaurus. | `editor/src/domain/articles/normalizeSlug.ts` | Тест: `i18n/ru/docusaurus-plugin-content-docs/current/help/foo/index.mdx` + `slug: install-plugin` -> `/help/install-plugin`. |
| Если `slug` уже абсолютный, редактор его не переписывает. | Нельзя задваивать категорию: `/help/install-plugin` не должен стать `/help/help/install-plugin`. | `editor/src/domain/articles/normalizeSlug.ts` | Тест: абсолютный slug сохраняется без изменений. |
| Имена вставляемых и загружаемых изображений нормализуются в безопасный ASCII-slug. | Пробелы, кириллица и спецсимволы в имени файла могут сделать URI невалидным и сломать сборку. | `editor/src/domain/assets/safeAssetName.ts` | Тест: `Pinnerest 01.png` -> `pinnerest-01.png`; кириллица транслитерируется или заменяется безопасно. |
| Картинки статьи по умолчанию хранятся рядом с `index.mdx`. | Это текущая архитектура контента: `folder/index.mdx` + соседние медиа, чтобы локали могли иметь свои изображения. | `editor/src/domain/assets/articleAssetPath.ts` | Тест: вставка картинки в статью кладёт файл в папку этой статьи и пишет относительную ссылку. |
| Slug переводной статьи должен совпадать со slug исходной статьи. | Docusaurus связывает локали по одинаковому пути; перевод slug ломает переключатель языка и hreflang. | `editor/src/domain/locales/validateLocalizedArticle.ts` | Тест: RU/ES статья с отличающимся slug получает ошибку проверки. |
| Редактор должен поддерживать вставку уже принятых MDX-компонентов: `<CTA />`, `<YouTube />`, `<truncate />`. | Эти элементы есть в статьях и были доступны в старой CMS как быстрые вставки; новый редактор не должен ломать MDX. | `editor/src/domain/mdx/knownComponents.ts` и панель вставки редактора | Тест: roundtrip MDX с этими тегами не меняет исходный текст. |

## 2026-07-30: GitHub Actions читается как публичный репозиторий

Владелец подтвердил, что `vzeten/bimcore-blog` публичный. Новый редактор должен читать состояние GitHub Actions без личного токена. Поле токена для этого сценария не требуется.
