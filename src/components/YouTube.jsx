import React, {useState} from 'react';
import Head from '@docusaurus/Head';
import styles from '../css/youtube.module.css';

/**
 * Адаптивное YouTube-видео для статей.
 *
 * Зачем компонент, а не голый <iframe>:
 *  - Всегда строгие 16:9 (aspect-ratio в CSS) — обложка не сжимается на любом экране.
 *  - Фасад (facade): до клика показываем картинку-превью + кнопку Play,
 *    тяжёлый плеер YouTube грузится только по клику. Быстрее загрузка (LCP),
 *    лучше для SEO и мобильных.
 *  - VideoObject (JSON-LD) — структурированные данные для поисковиков,
 *    добавляются только если заданы title + uploadDate (требование Google).
 *
 * Использование в .mdx (import не нужен — зарегистрирован глобально):
 *   <YouTube id="ifJtfM3LgGg" title="Розетки для Revit" />
 *
 * Вставляется кнопкой «YouTube видео» в редакторе Sveltia CMS.
 *
 * @param {string} id      ID видео из URL (?v=ID). Обязательный.
 * @param {string} title   Подпись для accessibility и schema.org. По умолчанию 'YouTube video'.
 * @param {string} [uploadDate]  Дата публикации (YYYY-MM-DD) — включает VideoObject schema.
 * @param {string} [description] Описание для VideoObject schema.
 */
export default function YouTube({id, title = 'YouTube video', uploadDate, description}) {
  const [loaded, setLoaded] = useState(false);

  if (!id) return null;

  // maxresdefault — резкое HD-превью 1280×720 (нативный 16:9, не мылит).
  // Если у видео нет HD-кадра — onError откатывается на hqdefault (есть всегда).
  const thumbnail = `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`;
  const fallbackThumbnail = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  const embedUrl = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`;

  return (
    <>
      {uploadDate && (
        <Head>
          <script type="application/ld+json">
            {JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'VideoObject',
              name: title,
              description: description || title,
              thumbnailUrl: `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`,
              uploadDate,
              embedUrl: `https://www.youtube.com/embed/${id}`,
              contentUrl: `https://www.youtube.com/watch?v=${id}`,
            })}
          </script>
        </Head>
      )}

      <div className={styles.wrapper}>
        {loaded ? (
          <iframe
            src={embedUrl}
            title={title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        ) : (
          <button
            type="button"
            className={styles.facade}
            onClick={() => setLoaded(true)}
            aria-label={`Воспроизвести: ${title}`}
          >
            <img
              className={styles.thumbnail}
              src={thumbnail}
              alt={title}
              loading="lazy"
              onError={(e) => {
                if (e.currentTarget.src !== fallbackThumbnail) {
                  e.currentTarget.src = fallbackThumbnail;
                }
              }}
            />
            <span className={styles.playButton}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M8 5v14l11-7z" />
              </svg>
            </span>
          </button>
        )}
      </div>
    </>
  );
}
