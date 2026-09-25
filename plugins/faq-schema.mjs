// Разметка FAQPage для раздела «Вопросы и ответы» (ED-029): автор пишет обычные заголовки и абзацы, без JSX.
// Раздел — H2 с названием из списка ниже; вопрос — каждый H3 до следующего H2, ответ — абзацы, списки,
// цитаты и таблицы под ним (блоки-компоненты вроде CTA в ответ не входят). Плагин дописывает в конец страницы
// невидимый глобальный компонент <FaqSchema> с готовым JSON-LD; читатель страницы разницы не видит.
// Статья без такого раздела или без пары «вопрос — ответ» ничего не получает.
// Зачем: вопросы и ответы в виде, понятном ИИ-поиску и Bing; расширенный сниппет Google целью не является.

/** Названия раздела во всех языках сайта (стандарт статей: «Вопросы и ответы» не нумеруется и стоит последним). */
const НАЗВАНИЯ = ['faq', 'вопросы и ответы', 'preguntas frecuentes', 'preguntas y respuestas'];

/** Узлы, из которых складывается текст ответа. */
const БЛОКИ_ОТВЕТА = ['paragraph', 'list', 'blockquote', 'table'];

/** Строчные узлы: их текст склеивается без пробела, блочные — через пробел. */
const СТРОЧНЫЕ = new Set(['text', 'inlineCode', 'emphasis', 'strong', 'delete', 'link', 'linkReference']);

/** Чистый текст узла без разметки Markdown: картинки и встроенные компоненты не дают текста. */
function текст(узел) {
  if (узел.type === 'text' || узел.type === 'inlineCode') return узел.value;
  if (узел.type === 'break') return ' ';
  if (!Array.isArray(узел.children) || узел.type === 'image' || узел.type.startsWith('mdx')) return '';
  const строчные = узел.children.every((р) => СТРОЧНЫЕ.has(р.type) || р.type === 'break');
  return узел.children.map(текст).join(строчные ? '' : ' ');
}

const чисто = (строка) => строка.replace(/\s+/g, ' ').trim();

/** Пары «вопрос — ответ» раздела FAQ корня документа; раздела нет — пустой список. */
export function парыFaq(дерево) {
  const дети = дерево.children ?? [];
  const начало = дети.findIndex((у) => у.type === 'heading' && у.depth === 2 && НАЗВАНИЯ.includes(чисто(текст(у)).toLowerCase()));
  if (начало < 0) return [];
  const пары = [];
  for (const узел of дети.slice(начало + 1)) {
    if (узел.type === 'heading' && узел.depth <= 2) break;
    if (узел.type === 'heading' && узел.depth === 3) {
      пары.push({вопрос: чисто(текст(узел)), ответ: []});
    } else if (пары.length > 0 && БЛОКИ_ОТВЕТА.includes(узел.type)) {
      пары[пары.length - 1].ответ.push(текст(узел));
    }
  }
  return пары.map((п) => ({вопрос: п.вопрос, ответ: чисто(п.ответ.join(' '))})).filter((п) => п.вопрос && п.ответ);
}

export default function faqSchema() {
  return (дерево) => {
    const пары = парыFaq(дерево);
    if (пары.length === 0) return;
    const данные = {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: пары.map((п) => ({'@type': 'Question', name: п.вопрос, acceptedAnswer: {'@type': 'Answer', text: п.ответ}})),
    };
    дерево.children.push({
      type: 'mdxJsxFlowElement',
      name: 'FaqSchema',
      // `<`, `>` и `&` — escape-последовательностями JSON: текст ответа вроде `</script>` иначе закрыл бы
      // разметку раньше времени и открыл исполняемый код. Для читателя JSON-LD значение то же.
      attributes: [{type: 'mdxJsxAttribute', name: 'data', value: JSON.stringify(данные).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')}],
      children: [],
    });
  };
}
