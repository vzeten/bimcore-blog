import {Component, StrictMode, type ReactNode} from 'react';
import {createRoot} from 'react-dom/client';
import {App} from './App';
import './styles.css';
import './registry.css';
import './properties.css';
import './feedback.css';
import './versions.css';
import './imagePanel.css';

/** Белый экран вместо программы недопустим: ошибку надо показать словами. */
class Guard extends Component<{children: ReactNode}, {error: Error | null}> {
  state: {error: Error | null} = {error: null};

  static getDerivedStateFromError(error: Error) {
    return {error};
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="crash">
        <h1>Редактор споткнулся</h1>
        <p>Статьи не тронуты — программа ничего не сохраняет при сбое.</p>
        <pre>{this.state.error.message}</pre>
        <button onClick={() => window.location.reload()}>Перезагрузить</button>
      </div>
    );
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Guard>
      <App />
    </Guard>
  </StrictMode>,
);
