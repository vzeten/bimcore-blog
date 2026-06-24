// Глобальная регистрация MDX-компонентов для Docusaurus.
// Все компоненты, перечисленные здесь, доступны во ВСЕХ .mdx файлах
// без необходимости `import` в шапке файла.
//
// Свизл: создан вручную (без `docusaurus swizzle` CLI) — это поддерживаемый паттерн.
// Документация: https://docusaurus.io/docs/markdown-features/react#mdx-component-scope
//
// При добавлении нового глобального компонента:
// 1. Создать его в src/components/<Name>.jsx (или .tsx)
// 2. Импортировать здесь
// 3. Добавить в объект экспорта
// 4. Готово — `<Name />` теперь работает в любом .mdx без import

import MDXComponents from '@theme-original/MDXComponents';
import CTA from '@site/src/components/CTA';
import YouTube from '@site/src/components/YouTube';
import ProductCard from '@site/src/components/ProductCard';

export default {
  ...MDXComponents,
  // CTA — call-to-action блок (см. src/components/CTA.jsx).
  // Используется в .mdx как: <CTA type="blog" /> (или lesson | course | guide | help).
  // В Sveltia CMS — кнопка «CTA блок» в редакторе.
  CTA,
  // YouTube — адаптивное 16:9 видео с ленивой загрузкой (см. src/components/YouTube.jsx).
  // Используется в .mdx как: <YouTube id="ifJtfM3LgGg" title="..." />.
  // В Sveltia CMS — кнопка «YouTube видео» в редакторе.
  YouTube,
  // ProductCard — лёгкая карточка товара с витриной и ссылками (см. src/components/ProductCard.jsx).
  // Используется в .mdx как: <ProductCard name="..." image="..." buyUrl="..." price="121" currency="GBP" />.
  ProductCard,
  // <truncate /> — маркер обрыва превью для blog plugin (truncateMarker в docusaurus.config.js).
  // Сам компонент ничего не рендерит — он только marker для Docusaurus.
  // Регистрируем чтобы MDX парсер не выдавал warning про unknown component.
  truncate: () => null,
};
