// Вход окна панели. Отдельный от окна редактора: панель поднимается своей программой и обязана
// работать, когда не запущен ни один экземпляр.

import {Component, StrictMode, type ReactNode} from 'react';
import {createRoot} from 'react-dom/client';

import {setLabels} from '../labels';
import {Panel} from './Panel';
import './panel.css';

// Надписи вложены в саму страницу сервером панели: первая же ошибка сети должна быть словами, а не
// именем ключа, и ждать для этого отдельного запроса нельзя (SPEC 6.10).
setLabels(window.ПАНЕЛЬ.подписи);

/** Белый экран вместо панели недопустим: ошибку надо показать словами (SPEC 4.11). */
class Guard extends Component<{children: ReactNode}, {error: Error | null}> {
  state: {error: Error | null} = {error: null};

  static getDerivedStateFromError(error: Error) {
    return {error};
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="crash">
        <h1>{window.ПАНЕЛЬ.надписи.пояснения['споткнулась']}</h1>
        <pre>{this.state.error.message}</pre>
        <button type="button" className="кнопка" onClick={() => window.location.reload()}>
          {window.ПАНЕЛЬ.надписи.обновить}
        </button>
      </div>
    );
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Guard>
      <Panel />
    </Guard>
  </StrictMode>,
);
