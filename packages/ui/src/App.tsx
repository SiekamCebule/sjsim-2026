import { useState } from 'react';
import type { SapporoWeekendResult } from '@sjsim/core';
import type { GameConfigState } from './components/GameConfig';
import { GameConfig } from './components/GameConfig';
import { MainMenu } from './components/MainMenu';
import { PredazzoDashboard } from './components/PredazzoDashboard';
import { SapporoResults } from './components/SapporoResults';
import { CallupsAfterSapporo } from './components/CallupsAfterSapporo';
import { CompetitionScreen } from './components/CompetitionScreen';
import type { ScheduleItem, NextEventWeather } from './data/predazzoSchedule';
import type { Jumper } from './data/jumpersData';
import './components/game-config.css';
import './components/main-menu.css';
import './components/predazzo-dashboard.css';
import './components/sapporo-results.css';
import './components/competition-screen.css';
import './styles-transitions.css';

type View = 'main' | 'config' | 'sapporo-results' | 'callups-after-sapporo' | 'predazzo-dashboard' | 'competition';

interface CompetitionStartPayload {
  event: ScheduleItem;
  participating?: Jumper[];
  autoBar?: boolean;
  weather?: NextEventWeather;
  teamLineups?: Record<string, Jumper[]>;
}

const App = (): JSX.Element => {
  const [view, setView] = useState<View>('main');
  const [pendingConfig, setPendingConfig] = useState<GameConfigState | null>(null);
  const [sapporoResult, setSapporoResult] = useState<SapporoWeekendResult | null>(null);
  const [competitionStart, setCompetitionStart] = useState<CompetitionStartPayload | null>(null);
  const [autoJumpIntervalMs, setAutoJumpIntervalMs] = useState(5000);
  const [completedEventIds, setCompletedEventIds] = useState<string[]>([]);
  const [trainingBlockProgress, setTrainingBlockProgress] = useState<Record<string, number>>({});
  const [skipPredazzoIntro, setSkipPredazzoIntro] = useState(false);

  const handleConfigStart = (config: GameConfigState): void => {
    setSkipPredazzoIntro(false);
    const needsSapporo =
      config.mode === 'director'
        ? config.directorStart === 'sapporo'
        : config.coachStart === 'sapporo';
    const directorOlympics =
      config.mode === 'director' && config.directorStart === 'olympics';
    if (needsSapporo) {
      setPendingConfig(config);
      setView('sapporo-results');
    } else if (directorOlympics) {
      setPendingConfig(config);
      setView('callups-after-sapporo');
    } else {
      setPendingConfig(config);
      setView('predazzo-dashboard');
    }
  };

  const handleSapporoComplete = (result: SapporoWeekendResult | null): void => {
    if (result) setSapporoResult(result);
    if (!pendingConfig) return;
    const hasSapporoStart =
      pendingConfig.directorStart === 'sapporo' ||
      (pendingConfig.mode === 'coach' && pendingConfig.coachStart === 'sapporo');
    if (hasSapporoStart) {
      setView('callups-after-sapporo');
    } else {
      setView('predazzo-dashboard');
    }
  };

  const handleCallupsAfterSapporoComplete = (config: GameConfigState): void => {
    setPendingConfig(config);
    setView('predazzo-dashboard');
  };

  const handleStartCompetition = (payload: CompetitionStartPayload): void => {
    setCompetitionStart(payload);
    setView('competition');
  };

  const handleCompetitionExit = (params?: { aborted?: boolean }): void => {
    if (params?.aborted) {
      setSkipPredazzoIntro(true);
      setView('predazzo-dashboard');
      return;
    }
    if (competitionStart?.event) {
      const event = competitionStart.event;
      if (event.type === 'training' && (event.trainingSeries ?? 1) >= 2) {
        setTrainingBlockProgress((prev) => {
          const current = prev[event.id] ?? 0;
          const next = Math.min(event.trainingSeries ?? 1, current + 1);
          if (next >= (event.trainingSeries ?? 1)) {
            setCompletedEventIds((ids) => (ids.includes(event.id) ? ids : [...ids, event.id]));
          }
          return { ...prev, [event.id]: next };
        });
      } else {
        setCompletedEventIds((prev) => (prev.includes(event.id) ? prev : [...prev, event.id]));
      }
    }
    setSkipPredazzoIntro(true);
    setView('predazzo-dashboard');
  };

  const appViewClass = [
    'app-view',
    view === 'predazzo-dashboard' && 'app-view--predazzo-enter',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="app-wrap">
      <div className={appViewClass}>
        {view === 'config' && (
          <GameConfig onBack={() => setView('main')} onStart={handleConfigStart} />
        )}
        {view === 'sapporo-results' && pendingConfig && (
          <SapporoResults
            config={pendingConfig}
            onComplete={handleSapporoComplete}
            onBack={() => setView('main')}
          />
        )}
        {view === 'callups-after-sapporo' &&
          pendingConfig &&
          (pendingConfig.directorStart === 'sapporo' ||
            (pendingConfig.mode === 'coach' && pendingConfig.coachStart === 'sapporo') ||
            (pendingConfig.mode === 'director' && pendingConfig.directorStart === 'olympics')) && (
            <CallupsAfterSapporo
              config={pendingConfig}
              sapporoResult={sapporoResult}
              onComplete={handleCallupsAfterSapporoComplete}
              onBack={() =>
                pendingConfig.mode === 'director' && pendingConfig.directorStart === 'olympics'
                  ? setView('config')
                  : setView('sapporo-results')
              }
              showSapporoPreview={
                !(pendingConfig.mode === 'director' && pendingConfig.directorStart === 'olympics')
              }
            />
          )}
        {view === 'competition' && competitionStart && (
          <CompetitionScreen
            event={competitionStart.event}
            config={pendingConfig}
            participating={competitionStart.participating}
            teamLineups={competitionStart.teamLineups}
            autoBar={competitionStart.autoBar}
            weather={competitionStart.weather}
            autoJumpIntervalMs={autoJumpIntervalMs}
            onExit={handleCompetitionExit}
          />
        )}
        {view === 'main' && (
          <MainMenu
            onNewGame={() => setView('config')}
            autoJumpIntervalMs={autoJumpIntervalMs}
            onAutoJumpIntervalChange={setAutoJumpIntervalMs}
          />
        )}
        {view === 'predazzo-dashboard' && (
          <PredazzoDashboard
            config={pendingConfig}
            onBack={() => setView('main')}
            onGoToNextEvent={handleStartCompetition}
            completedEventIds={completedEventIds}
            trainingBlockProgress={trainingBlockProgress}
            skipIntro={skipPredazzoIntro}
          />
        )}
      </div>
    </div>
  );
};

export default App;
