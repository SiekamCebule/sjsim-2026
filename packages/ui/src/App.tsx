import { useState } from 'react';
import type { GameConfigState } from './components/GameConfig';
import { GameConfig } from './components/GameConfig';
import { MainMenu } from './components/MainMenu';
import './components/game-config.css';
import './components/main-menu.css';
import './styles-transitions.css';

type View = 'main' | 'config';

const App = (): JSX.Element => {
  const [view, setView] = useState<View>('main');

  return (
    <div className="app-wrap">
      <div key={view} className="app-view">
        {view === 'config' ? (
          <GameConfig
            onBack={() => setView('main')}
            onStart={(config: GameConfigState) => {
              console.log('Start rozgrywki:', config);
            }}
          />
        ) : (
          <MainMenu onNewGame={() => setView('config')} />
        )}
      </div>
    </div>
  );
};

export default App;
