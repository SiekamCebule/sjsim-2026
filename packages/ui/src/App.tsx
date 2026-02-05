import { useState, useEffect } from 'react';
import type { SapporoWeekendResult, JuryBravery } from '@sjsim/core';
import { runSapporoWeekend, createDefaultRandom, applyFormChangeToRoster, FORM_CHANGE_ALPHA } from '@sjsim/core';
import type { GameConfigState } from './components/GameConfig';
import { GameConfig } from './components/GameConfig';
import { MainMenu } from './components/MainMenu';
import { PredazzoDashboard } from './components/PredazzoDashboard';
import { SapporoResults } from './components/SapporoResults';
import { CallupsAfterSapporo } from './components/CallupsAfterSapporo';
import { CompetitionScreen } from './components/CompetitionScreen';
import type { ScheduleItem, NextEventWeather } from './data/predazzoSchedule';
import { getNextEventByProgress } from './data/predazzoSchedule';
import type { Jumper } from './data/jumpersData';
import type { EventResultsSummary } from './data/eventResults';
import type { ArchiveEntry } from './data/archiveTypes';
import type { GameDataSnapshot } from './data/gameDataSnapshot';
import type { SaveGamePayload, SaveSummary } from './data/saveTypes';
import { createGameDataSnapshot, resolveSchedule } from './data/gameDataSnapshot';
import { buildSapporoArchiveEntries } from './data/archiveUtils';
import { loadGame, saveGame, getSaveSummary } from './data/localSave';
import { buildSapporoRoster } from './data/sapporoData';
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
  juryBravery?: JuryBravery;
  weather?: NextEventWeather;
  teamLineups?: Record<string, Jumper[]>;
  trainingSeriesIndex?: number;
}

const hasDetailedSapporoResult = (result: SapporoWeekendResult | null): boolean => {
  if (!result || result.steps.length === 0) return false;
  return result.steps.every((step) => {
    const requiresStyle = step.eventLabel !== 'Trening' && step.eventLabel !== 'Seria próbna';
    if (step.rows.length === 0) return false;
    const row = step.rows[0];
    if (step.kind === 'single') {
      const wind = (row as { wind?: { average: number; instability: number } }).wind;
      const gateDelta = (row as { gateDelta?: number }).gateDelta;
      const stylePoints = (row as { stylePoints?: number }).stylePoints;
      const hasWind = wind != null && typeof wind.average === 'number' && typeof wind.instability === 'number';
      const hasGate = typeof gateDelta === 'number';
      const hasStyle = !requiresStyle || typeof stylePoints === 'number';
      return hasWind && hasGate && hasStyle;
    }
    const jump = (row as {
      jump2?: { wind?: { average: number; instability: number }; gateDelta?: number; stylePoints?: number };
      jump1?: { wind?: { average: number; instability: number }; gateDelta?: number; stylePoints?: number };
    }).jump2 ?? (row as { jump1?: { wind?: { average: number; instability: number }; gateDelta?: number; stylePoints?: number } }).jump1;
    if (!jump) return false;
    const wind = jump.wind;
    const gateDelta = jump.gateDelta;
    const stylePoints = jump.stylePoints;
    const hasWind = wind != null && typeof wind.average === 'number' && typeof wind.instability === 'number';
    const hasGate = typeof gateDelta === 'number';
    const hasStyle = !requiresStyle || typeof stylePoints === 'number';
    return hasWind && hasGate && hasStyle;
  });
};

const ensureDetailedSapporoResult = (result: SapporoWeekendResult | null): SapporoWeekendResult | null => {
  if (!result || hasDetailedSapporoResult(result)) return result;
  const { roster, worldCupOrderIds } = buildSapporoRoster();
  const random = createDefaultRandom();
  const rosterWithForm = applyFormChangeToRoster(roster, FORM_CHANGE_ALPHA.sapporoGameStart, random);
  return runSapporoWeekend({ roster: rosterWithForm, worldCupOrderIds, random });
};

const App = (): JSX.Element => {
  const [view, setView] = useState<View>('main');
  const [pendingConfig, setPendingConfig] = useState<GameConfigState | null>(null);
  const [sapporoResult, setSapporoResult] = useState<SapporoWeekendResult | null>(null);
  const [competitionStart, setCompetitionStart] = useState<CompetitionStartPayload | null>(null);
  const [autoJumpIntervalMs, setAutoJumpIntervalMs] = useState(5000);
  const [theme, setTheme] = useState<'default' | 'deep-navy'>(() => {
    if (typeof window === 'undefined') return 'default';
    return (window.localStorage.getItem('sjsim-theme') as 'default' | 'deep-navy' | null) ?? 'default';
  });
  const [snowEnabled, setSnowEnabled] = useState(() => {
    if (typeof window === 'undefined') return true;
    const v = window.localStorage.getItem('sjsim-snow');
    return v === null || v === '1' || v === 'true';
  });
  const [completedEventIds, setCompletedEventIds] = useState<string[]>([]);
  const [trainingBlockProgress, setTrainingBlockProgress] = useState<Record<string, number>>({});
  const [eventResults, setEventResults] = useState<Record<string, EventResultsSummary>>({});
  const [archiveEntries, setArchiveEntries] = useState<ArchiveEntry[]>([]);
  const [gameData, setGameData] = useState<GameDataSnapshot | null>(null);
  const [saveSummary, setSaveSummary] = useState<SaveSummary | null>(null);
  const isExperimental = typeof __EXPERIMENTAL_SJSIM__ !== 'undefined' && __EXPERIMENTAL_SJSIM__;
  const [skipPredazzoIntro, setSkipPredazzoIntro] = useState(isExperimental);
  const [showPredazzoFinalDialog, setShowPredazzoFinalDialog] = useState(false);

  useEffect(() => {
    let isMounted = true;
    getSaveSummary().then((summary) => {
      if (isMounted) setSaveSummary(summary);
    });
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.dataset.theme = theme;
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('sjsim-theme', theme);
    }
  }, [theme]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('sjsim-snow', snowEnabled ? '1' : '0');
  }, [snowEnabled]);

  const schedule = resolveSchedule(gameData);
  const mainCompetitionIds = schedule.filter((item) => item.isMainCompetition).map((item) => item.id);

  const areAllMainCompetitionsCompleted = (ids: string[]): boolean =>
    mainCompetitionIds.length > 0 && mainCompetitionIds.every((id) => ids.includes(id));

  const buildSaveMeta = (
    entries: ArchiveEntry[],
    state?: {
      gameData: GameDataSnapshot | null;
      completedEventIds: string[];
      trainingBlockProgress: Record<string, number>;
    }
  ): SaveGamePayload['meta'] => {
    const lastEntry = entries
      .slice()
      .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())[0];
    const location = lastEntry?.source === 'sapporo' ? 'Sapporo (Japonia)' : 'Predazzo (Austria)';
    const schedule = state?.gameData ? resolveSchedule(state.gameData) : [];
    const nextItem = getNextEventByProgress(
      state?.completedEventIds ?? [],
      state?.trainingBlockProgress ?? {},
      schedule
    );
    const summary = nextItem
      ? nextItem.label
      : lastEntry?.source === 'predazzo'
        ? lastEntry.shortLabel
        : lastEntry
          ? `${lastEntry.eventLabel} · ${lastEntry.seriesLabel || 'Wyniki'}`
          : 'Rozgrywka rozpoczęta';
    return {
      location,
      summary,
      lastPlayed: new Date().toLocaleDateString('pl-PL'),
    };
  };

  const buildSavePayload = (params?: {
    state?: Partial<SaveGamePayload['state']>;
    archiveEntries?: ArchiveEntry[];
  }): SaveGamePayload => {
    const nextArchive = params?.archiveEntries ?? archiveEntries;
    const state: SaveGamePayload['state'] = {
      config: pendingConfig,
      sapporoResult,
      completedEventIds,
      trainingBlockProgress,
      eventResults,
      gameData,
      autoJumpIntervalMs,
      skipPredazzoIntro,
      ...params?.state,
    };
    return {
      version: 1,
      updatedAt: new Date().toISOString(),
      meta: buildSaveMeta(nextArchive, {
        gameData: state.gameData ?? null,
        completedEventIds: state.completedEventIds ?? [],
        trainingBlockProgress: state.trainingBlockProgress ?? {},
      }),
      state,
      archiveEntries: nextArchive,
    };
  };

  const persistSave = async (params?: {
    state?: Partial<SaveGamePayload['state']>;
    archiveEntries?: ArchiveEntry[];
  }): Promise<void> => {
    const payload = buildSavePayload(params);
    await saveGame(payload);
    setSaveSummary({ version: payload.version, updatedAt: payload.updatedAt, meta: payload.meta, hasSave: true });
  };

  const handleConfigStart = (config: GameConfigState): void => {
    setCompletedEventIds([]);
    setTrainingBlockProgress({});
    setEventResults({});
    setArchiveEntries([]);
    setSapporoResult(null);
    setGameData(createGameDataSnapshot());
    setSkipPredazzoIntro(isExperimental);
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
    if (result) {
      const completedAt = new Date().toISOString();
      setArchiveEntries((prev) => [
        ...prev.filter((entry) => entry.source !== 'sapporo'),
        ...buildSapporoArchiveEntries(result, completedAt),
      ]);
    }
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
    void persistSave({
      state: { config, sapporoResult, skipPredazzoIntro: true },
      archiveEntries,
    });
    setView('predazzo-dashboard');
  };

  const handleStartCompetition = (payload: CompetitionStartPayload): void => {
    setCompetitionStart(payload);
    setView('competition');
  };

  const handleLoadGame = async (): Promise<void> => {
    const payload = await loadGame();
    if (!payload) return;
    const { state, archiveEntries: loadedArchive } = payload;
    const detailedSapporoResult = ensureDetailedSapporoResult(state.sapporoResult ?? null);
    const nextArchiveEntries =
      detailedSapporoResult && (!state.sapporoResult || !hasDetailedSapporoResult(state.sapporoResult))
        ? [
          ...(loadedArchive ?? []).filter((entry) => entry.source !== 'sapporo'),
          ...buildSapporoArchiveEntries(detailedSapporoResult, new Date().toISOString()),
        ]
        : (loadedArchive ?? []);
    setPendingConfig(state.config ?? null);
    setSapporoResult(detailedSapporoResult ?? null);
    setCompletedEventIds(state.completedEventIds ?? []);
    setTrainingBlockProgress(state.trainingBlockProgress ?? {});
    setEventResults(state.eventResults ?? {});
    setArchiveEntries(nextArchiveEntries);
    setGameData(state.gameData ?? createGameDataSnapshot());
    setAutoJumpIntervalMs(state.autoJumpIntervalMs ?? 5000);
    setSkipPredazzoIntro(state.skipPredazzoIntro ?? true);
    setShowPredazzoFinalDialog(false);
    setCompetitionStart(null);
    const nextMeta = buildSaveMeta(nextArchiveEntries, {
      gameData: state.gameData ?? createGameDataSnapshot(),
      completedEventIds: state.completedEventIds ?? [],
      trainingBlockProgress: state.trainingBlockProgress ?? {},
    });
    setSaveSummary({ version: payload.version, updatedAt: payload.updatedAt, meta: nextMeta, hasSave: true });
    setView('predazzo-dashboard');
  };

  const handleCompetitionExit = (params?: { aborted?: boolean; summary?: EventResultsSummary; archive?: ArchiveEntry }): void => {
    if (params?.aborted) {
      setSkipPredazzoIntro(true);
      setView('predazzo-dashboard');
      return;
    }
    const nextEventResults = params?.summary
      ? { ...eventResults, [params.summary.eventId]: params.summary }
      : eventResults;
    const nextArchiveEntries = params?.archive
      ? [...archiveEntries, params.archive]
      : archiveEntries;
    let nextCompletedEventIds = completedEventIds;
    let nextTrainingBlockProgress = trainingBlockProgress;
    if (competitionStart?.event) {
      const event = competitionStart.event;
      if (event.type === 'training' && (event.trainingSeries ?? 1) >= 2) {
        const current = trainingBlockProgress[event.id] ?? 0;
        const next = Math.min(event.trainingSeries ?? 1, current + 1);
        nextTrainingBlockProgress = { ...trainingBlockProgress, [event.id]: next };
        if (next >= (event.trainingSeries ?? 1)) {
          nextCompletedEventIds = completedEventIds.includes(event.id)
            ? completedEventIds
            : [...completedEventIds, event.id];
        }
      } else {
        nextCompletedEventIds = completedEventIds.includes(event.id)
          ? completedEventIds
          : [...completedEventIds, event.id];
        if (event.isMainCompetition && areAllMainCompetitionsCompleted(nextCompletedEventIds)) {
          setShowPredazzoFinalDialog(true);
        }
      }
    }
    setEventResults(nextEventResults);
    setArchiveEntries(nextArchiveEntries);
    setTrainingBlockProgress(nextTrainingBlockProgress);
    setCompletedEventIds(nextCompletedEventIds);
    void persistSave({
      state: {
        eventResults: nextEventResults,
        completedEventIds: nextCompletedEventIds,
        trainingBlockProgress: nextTrainingBlockProgress,
        skipPredazzoIntro: true,
      },
      archiveEntries: nextArchiveEntries,
    });
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
            juryBravery={competitionStart.juryBravery}
            weather={competitionStart.weather}
            autoJumpIntervalMs={autoJumpIntervalMs}
            eventResults={eventResults}
            trainingSeriesIndex={competitionStart.trainingSeriesIndex}
            gameData={gameData}
            onExit={handleCompetitionExit}
          />
        )}
        {view === 'main' && (
          <MainMenu
            onNewGame={() => setView('config')}
            onLoadGame={handleLoadGame}
            autoJumpIntervalMs={autoJumpIntervalMs}
            onAutoJumpIntervalChange={setAutoJumpIntervalMs}
            saveSummary={saveSummary}
            theme={theme}
            onThemeChange={setTheme}
            snowEnabled={snowEnabled}
            onSnowChange={setSnowEnabled}
          />
        )}
        {view === 'predazzo-dashboard' && (
          <PredazzoDashboard
            config={pendingConfig}
            gameData={gameData}
            onBack={() => setView('main')}
            onGoToNextEvent={handleStartCompetition}
            completedEventIds={completedEventIds}
            trainingBlockProgress={trainingBlockProgress}
            skipIntro={skipPredazzoIntro}
            snowEnabled={snowEnabled}
            eventResults={eventResults}
            archiveEntries={archiveEntries}
            showFinalDialog={showPredazzoFinalDialog}
            onCloseFinalDialog={() => setShowPredazzoFinalDialog(false)}
          />
        )}
      </div>
    </div>
  );
};

export default App;
