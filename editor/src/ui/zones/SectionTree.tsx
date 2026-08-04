import {buildTree} from '../../core/registry.mjs';
import type {ArticleRow, Settings} from '../types';

/** Дерево разделов слева: оно же объясняет структуру сайта. Счётчик считает статьи, а не файлы. */
export function SectionTree(props: {
  settings: Settings;
  articles: ArticleRow[];
  chosen: string | null;
  onChoose: (id: string | null) => void;
}) {
  const nodes = buildTree(props.articles, props.settings);

  return (
    <nav className="tree">
      <button
        className={props.chosen === null ? 'tree-row tree-row-on' : 'tree-row'}
        onClick={() => props.onChoose(null)}
      >
        <span className="tree-label">{props.settings.реестр.всеРазделы}</span>
        <span className="tree-count">{props.articles.length}</span>
      </button>

      {nodes.map((node) => (
        <button
          key={node.id}
          className={props.chosen === node.id ? 'tree-row tree-row-on' : 'tree-row'}
          style={{paddingLeft: `${8 + node.depth * 14}px`}}
          onClick={() => props.onChoose(props.chosen === node.id ? null : node.id)}
        >
          <span className="tree-label">{node.label}</span>
          <span className="tree-count">{node.count}</span>
        </button>
      ))}
    </nav>
  );
}
