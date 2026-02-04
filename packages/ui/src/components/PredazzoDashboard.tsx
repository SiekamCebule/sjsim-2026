import { useState, useEffect } from 'react';
import type { JSX } from 'react';
import menuBg from '@assets/predazzo.jpg';
import {
  PREDAZZO_SCHEDULE,
  getNextEventByProgress,
  getNextEventWeather,
  getWeatherConditionLabel,
  isEventCompleted,
  isSnowyCondition,
  type ScheduleItem,
  type NextEventWeather,
} from '../data/predazzoSchedule';
import { WEATHER_ICONS } from '../data/weatherIcons';
import { getMenTeams, countryToFlag, countryCodeToName, type Jumper } from '../data/jumpersData';
import type { GameConfigState } from './GameConfig';
import { CompetitionPreviewDialog } from './CompetitionPreviewDialog';
import { TeamSelectionDialog } from './TeamSelectionDialog';
import './predazzo-dashboard.css';

interface PredazzoDashboardProps {
  config?: GameConfigState | null;
  onBack: () => void;
  onGoToNextEvent: (payload: {
    event: ScheduleItem;
    participating?: Jumper[];
    autoBar?: boolean;
    weather?: NextEventWeather;
    teamLineups?: Record<string, Jumper[]>;
  }) => void;
  completedEventIds: string[];
  trainingBlockProgress: Record<string, number>;
  skipIntro?: boolean;
}

/** Szkielet wyboru faworyta, czarnego konia, rozczarowania (algorytm do wspólnego zaprojektowania). */
function getJumperCorners(): {
  faworyt: { jumper: Jumper; label: string } | null;
  czarnyKon: { jumper: Jumper; label: string } | null;
  rozczarowanie: { jumper: Jumper; label: string } | null;
} {
  const all = getMenTeams();
  if (all.length < 3) {
    return { faworyt: null, czarnyKon: null, rozczarowanie: null };
  }
  return {
    faworyt: { jumper: all[0], label: 'Faworyt' },
    czarnyKon: { jumper: all[Math.min(1, all.length - 1)], label: 'Czarny koń' },
    rozczarowanie: { jumper: all[Math.min(2, all.length - 1)], label: 'Rozczarowanie' },
  };
}

function formatEventType(type: ScheduleItem['type']): string {
  const t: Record<ScheduleItem['type'], string> = {
    training: 'Trening',
    trial: 'Seria próbna',
    individual: 'Konkurs indywidualny',
    team_mixed: 'Drużyny mieszane',
    team_men_pairs: 'Duety mężczyzn',
  };
  return t[type] ?? type;
}

function GenderIconMale(): JSX.Element {
  return (
    <svg className="predazzo-dash__gender-icon" width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="10" cy="10" r="5" />
      <path d="M15 3h6v6" />
      <path d="M15 9L21 3" />
    </svg>
  );
}

function GenderIconFemale(): JSX.Element {
  return (
    <svg className="predazzo-dash__gender-icon" width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="9" r="5" />
      <path d="M12 14v9M8 20h8" />
    </svg>
  );
}

function GenderIcon({ gender }: { gender: ScheduleItem['gender'] }): JSX.Element {
  if (gender === 'men') return <GenderIconMale />;
  if (gender === 'women') return <GenderIconFemale />;
  return (
    <span className="predazzo-dash__gender-icon-mixed" aria-hidden>
      <GenderIconMale />
      <GenderIconFemale />
    </span>
  );
}

function NextCardWeatherIcon({ condition }: { condition: NextEventWeather['condition'] }): JSX.Element {
  return (
    <img
      src={WEATHER_ICONS[condition]}
      alt=""
      className="predazzo-dash__weather-icon-img"
      aria-hidden
    />
  );
}

function WindIcon(): JSX.Element {
  return (
    <svg className="predazzo-dash__wind-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2" />
    </svg>
  );
}

/** Ikona „następne” — strzałka w prawo w kółku */
function NextUpIcon(): JSX.Element {
  return (
    <svg className="predazzo-dash__next-up-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12h6M14 10l3 2-3 2" />
    </svg>
  );
}

function WindLabel({ speed }: { speed: number }): JSX.Element {
  const abs = Math.abs(speed);
  const dirLabel = speed < 0 ? 'w plecy' : 'pod narty';
  return (
    <>
      {abs.toFixed(1)} m/s <em>{dirLabel}</em>
    </>
  );
}

/** Wiersze harmonogramu z datą i godziną (tabela). */
function scheduleTableRows(
  completedEventIds: string[],
  trainingBlockProgress: Record<string, number>
): { id: string; date: string; time: string; label: string; isPast: boolean; isMain: boolean }[] {
  return PREDAZZO_SCHEDULE.map((item) => ({
    id: item.id,
    date: formatScheduleDate(item.date),
    time: item.time,
    label:
      item.type === 'training' && (item.trainingSeries ?? 0) >= 2
        ? `${item.label} ×${item.trainingSeries}`
        : item.label,
    isPast: isEventCompleted(item, completedEventIds, trainingBlockProgress),
    isMain: item.isMainCompetition,
  }));
}

const MONTHS_PL = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'] as const;

/** Data YYYY-MM-DD → "13 lutego" (harmonogram, bez roku) */
function formatScheduleDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  const monthIdx = parseInt(m!, 10) - 1;
  const day = parseInt(d!, 10);
  return `${day} ${MONTHS_PL[monthIdx] ?? m}`;
}

/** Data YYYY-MM-DD → "5 lutego 2026" (karta następnych skoków) */
function formatDateWithYear(iso: string): string {
  const [y, m, d] = iso.split('-');
  const monthIdx = parseInt(m!, 10) - 1;
  const day = parseInt(d!, 10);
  return `${day} ${MONTHS_PL[monthIdx] ?? m} ${y ?? '2026'}`;
}

const ROMAN = ['', 'I', 'II', 'III'];

/**
 * Klucz bloku treningowego: jeden wpis w harmonogramie z trainingSeries 2+ to jeden blok
 * (w grze rozgrywany sekwencyjnie jako trening I, II, III). Stan: ile już rozegrano (0, 1, 2).
 */
function getTrainingBlockKey(item: ScheduleItem): string | null {
  if (item.type !== 'training' || (item.trainingSeries ?? 0) < 2) return null;
  return item.id;
}

/** Ile treningów w tym bloku już rozegrano (0 → następny to I, 1 → II, 2 → III). */
function getCompletedInBlock(blockKey: string | null, progress: Record<string, number>): number {
  if (!blockKey) return 0;
  const n = progress[blockKey] ?? 0;
  return Math.max(0, n);
}

/** Krótka etykieta typu np. "Trening mężczyzn III" — numer I/II/III z sekwencji w bloku. */
function formatEventShortLabel(
  item: ScheduleItem,
  completedInBlock: number = 0
): string {
  const gender = item.gender === 'men' ? 'mężczyzn' : item.gender === 'women' ? 'kobiet' : 'mieszany';
  if (item.type === 'training') {
    const series = item.trainingSeries ?? 0;
    const suffix =
      series >= 2 ? ` ${ROMAN[completedInBlock + 1]}` : ''; // I, II, III w zależności od stanu
    return `Trening ${gender}${suffix}`;
  }
  if (item.type === 'trial') return `Seria próbna ${gender}`;
  return item.label;
}

const REVEAL_DELAY_MS = 8000;

/** Tylko gdy trener z wybraną kadrą — zwraca kod kraju do pokazania flagi i nazwy. */
function getCoachCountry(config: PredazzoDashboardProps['config']): string | null {
  if (config?.mode !== 'coach' || !config.selectedCountry) return null;
  return config.selectedCountry;
}

export const PredazzoDashboard = ({
  config,
  onBack,
  onGoToNextEvent,
  completedEventIds,
  trainingBlockProgress,
  skipIntro,
}: PredazzoDashboardProps): JSX.Element => {
  const [revealed, setRevealed] = useState(Boolean(skipIntro));
  useEffect(() => {
    if (skipIntro) return;
    const t = setTimeout(() => setRevealed(true), REVEAL_DELAY_MS);
    return () => clearTimeout(t);
  }, [skipIntro]);

  const [tab, setTab] = useState<'main' | 'archive'>('main');
  /** Pokaż dialog podglądu konkursu przed przejściem (trening/seria próbna indywidualna). */
  const [previewEvent, setPreviewEvent] = useState<ScheduleItem | null>(null);
  const [teamSelectionEvent, setTeamSelectionEvent] = useState<ScheduleItem | null>(null);
  const next = getNextEventByProgress(completedEventIds, trainingBlockProgress);
  const weather = getNextEventWeather(next, trainingBlockProgress);
  const corners = getJumperCorners();
  const scheduleRows = scheduleTableRows(completedEventIds, trainingBlockProgress);
  const hasPrecipitation = isSnowyCondition(weather.condition);
  const coachCountry = getCoachCountry(config);

  const nextTrainingBlockKey = next ? getTrainingBlockKey(next) : null;
  const completedInBlock = getCompletedInBlock(nextTrainingBlockKey, trainingBlockProgress);

  /** Czy następny event to trening lub seria próbna indywidualna (men/women). */
  const isIndividualTrainingOrTrial = next != null &&
    (next.type === 'training' || next.type === 'trial') &&
    (next.gender === 'men' || next.gender === 'women');
  const isTeamEvent = next != null && (next.type === 'team_men_pairs' || next.type === 'team_mixed');
  const isCoachWithCountry = config?.mode === 'coach' && !!config.selectedCountry;

  const handleGoToNextEvent = (): void => {
    if (isIndividualTrainingOrTrial && next) {
      setPreviewEvent(next);
      return;
    }
    if (isTeamEvent && isCoachWithCountry && next) {
      setTeamSelectionEvent(next);
      return;
    }
    advanceToNextEvent();
  };

  const advanceToNextEvent = (): void => {
    if (next) {
      onGoToNextEvent({ event: next, weather });
    }
  };

  const handlePreviewConfirm = (params: { participating: Jumper[]; autoBar: boolean }): void => {
    setPreviewEvent(null);
    if (next) {
      onGoToNextEvent({
        event: next,
        participating: params.participating,
        autoBar: params.autoBar,
        weather,
      });
    }
  };

  const handleTeamSelectionConfirm = (lineup: Jumper[]): void => {
    setTeamSelectionEvent(null);
    if (next && config?.selectedCountry) {
      onGoToNextEvent({
        event: next,
        weather,
        teamLineups: {
          [config.selectedCountry]: lineup,
        },
      });
    }
  };

  /** Mock: brak rozegranych = empty; ostatni konkurs vs trening decyduje o drugiej tabeli */
  const hasNoResultsYet = true;
  const lastWasTraining = false;
  const showSecondTable = !hasNoResultsYet && lastWasTraining;

  return (
    <div
      className={`predazzo-dash ${revealed ? 'predazzo-dash--revealed' : ''} ${tab === 'archive' ? 'predazzo-dash--archive' : ''}`}
      style={{ backgroundImage: `url(${menuBg})` }}
      data-precipitation={hasPrecipitation ? 'snow' : undefined}
    >
      <div className="predazzo-dash__overlay" />
      {hasPrecipitation && <div className="predazzo-dash__snow" aria-hidden />}

      {previewEvent && (
        <CompetitionPreviewDialog
          event={previewEvent}
          config={config ?? null}
          weather={weather}
          onConfirm={handlePreviewConfirm}
          onCancel={() => setPreviewEvent(null)}
        />
      )}
      {teamSelectionEvent && (
        <TeamSelectionDialog
          event={teamSelectionEvent}
          config={config ?? null}
          onConfirm={handleTeamSelectionConfirm}
          onCancel={() => setTeamSelectionEvent(null)}
        />
      )}

      {!revealed && (
        <div className="predazzo-dash__reveal" aria-hidden>
          <div className="predazzo-dash__reveal-inner">
            <span className="predazzo-dash__reveal-text">Predazzo</span>
            <p className="predazzo-dash__reveal-tagline">
              Czas na najważniejszą rywalizację w sezonie! Kto okaże się najlepszy? Czy genialne słoweńskie rodzeństwo podtrzyma dominację? Czy przebudzi się kadra Polaków na czele z młodym talentem?
              Zaczynamy od treningów mężczyzn i kobiet.
            </p>
            <span className="predazzo-dash__reveal-line" aria-hidden />
          </div>
          <div className="predazzo-dash__reveal-progress" aria-hidden>
            <span className="predazzo-dash__reveal-progress-bar" />
          </div>
        </div>
      )}

      <header className="predazzo-dash__header">
        <button
          type="button"
          className="predazzo-dash__back"
          onClick={onBack}
          aria-label="Wróć do menu"
        >
          <BackIcon />
        </button>
        <div className="predazzo-dash__title-block">
          <h1 className="predazzo-dash__title">Sj.Sim</h1>
          <p className="predazzo-dash__subtitle">Predazzo Edition</p>
        </div>
        {coachCountry && (
          <span className="predazzo-dash__role-label" title={`Trener ${countryCodeToName(coachCountry)}`}>
            <span className="predazzo-dash__role-flag" aria-hidden>{countryToFlag(coachCountry)}</span>
            <span className="predazzo-dash__role-text">{countryCodeToName(coachCountry)}</span>
          </span>
        )}
        <div className="predazzo-dash__tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'main'}
            className={`predazzo-dash__tab ${tab === 'main' ? 'predazzo-dash__tab--active' : ''}`}
            onClick={() => setTab('main')}
          >
            <TrophyIcon />
            <span>Przegląd</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'archive'}
            className={`predazzo-dash__tab ${tab === 'archive' ? 'predazzo-dash__tab--active' : ''}`}
            onClick={() => setTab('archive')}
          >
            <ArchiveIcon />
            <span>Archiwum</span>
          </button>
        </div>
      </header>

      <div className="predazzo-dash__view">
        <div className="predazzo-dash__view-main">
          <div className="predazzo-dash__layout">
            <aside className="predazzo-dash__left">
              <section className="predazzo-dash__corners">
                {corners.faworyt && (
                  <div className="predazzo-dash__corner predazzo-dash__corner--faworyt">
                    <span className="predazzo-dash__corner-label">{corners.faworyt.label}</span>
                    <span className="predazzo-dash__corner-jumper">
                      {countryToFlag(corners.faworyt.jumper.country)}{' '}
                      {corners.faworyt.jumper.name} {corners.faworyt.jumper.surname}
                    </span>
                  </div>
                )}
                {corners.czarnyKon && (
                  <div className="predazzo-dash__corner predazzo-dash__corner--dark">
                    <span className="predazzo-dash__corner-label">{corners.czarnyKon.label}</span>
                    <span className="predazzo-dash__corner-jumper">
                      {countryToFlag(corners.czarnyKon.jumper.country)}{' '}
                      {corners.czarnyKon.jumper.name} {corners.czarnyKon.jumper.surname}
                    </span>
                  </div>
                )}
                {corners.rozczarowanie && (
                  <div className="predazzo-dash__corner predazzo-dash__corner--disappointment">
                    <span className="predazzo-dash__corner-label">{corners.rozczarowanie.label}</span>
                    <span className="predazzo-dash__corner-jumper">
                      {countryToFlag(corners.rozczarowanie.jumper.country)}{' '}
                      {corners.rozczarowanie.jumper.name} {corners.rozczarowanie.jumper.surname}
                    </span>
                  </div>
                )}
              </section>
              <section className="predazzo-dash__schedule-panel">
                <h2 className="predazzo-dash__schedule-title">Harmonogram</h2>
                <div className="predazzo-dash__schedule-wrap">
                  <table className="predazzo-dash__schedule-table">
                    <thead>
                      <tr>
                        <th>Dzień</th>
                        <th>Godz.</th>
                        <th>Wydarzenie</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scheduleRows.map((row) => (
                        <tr
                          key={row.id}
                          className={`${row.isPast ? 'predazzo-dash__schedule-row--past' : ''} ${row.isMain ? 'predazzo-dash__schedule-row--main' : ''}`}
                        >
                          <td>{row.date}</td>
                          <td>{row.time}</td>
                          <td>{row.label}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </aside>

            <main className="predazzo-dash__center" aria-hidden />

            <aside className="predazzo-dash__right">
              {next && (
                <section className="predazzo-dash__next" aria-label="Następne skoki">
                  <div className="predazzo-dash__next-type-row">
                    <span className="predazzo-dash__next-type">
                      {formatEventShortLabel(next, completedInBlock)}
                    </span>
                    <span className="predazzo-dash__next-gender-badge" title={next.gender === 'men' ? 'Mężczyźni' : next.gender === 'women' ? 'Kobiety' : 'Mieszany'}>
                      <GenderIcon gender={next.gender} />
                    </span>
                  </div>
                  <div className="predazzo-dash__next-datetime-weather">
                    <div className="predazzo-dash__next-datetime">
                      <p className="predazzo-dash__next-time">{next.time}</p>
                      <p className="predazzo-dash__next-date">{formatDateWithYear(next.date)}</p>
                    </div>
                    <div className="predazzo-dash__next-temp-block">
                      <span className="predazzo-dash__next-weather-icon" title={getWeatherConditionLabel(weather.condition)}>
                        <NextCardWeatherIcon condition={weather.condition} />
                      </span>
                      <span className="predazzo-dash__next-temp">{weather.tempC} °C</span>
                    </div>
                  </div>
                  <div className="predazzo-dash__next-divider" aria-hidden />
                  <div className="predazzo-dash__next-wind-row">
                    <span className="predazzo-dash__next-wind" title="Wiatr">
                      <WindIcon />
                      {WindLabel({ speed: weather.windMs })}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="predazzo-dash__next-btn"
                    onClick={handleGoToNextEvent}
                  >
                    <NextUpIcon />
                    <span>Przejdź</span>
                  </button>
                </section>
              )}
              <div className="predazzo-dash__results-area">
                <section className="predazzo-dash__results-table predazzo-dash__results-table--main">
                  {hasNoResultsYet ? (
                    <div className="predazzo-dash__results-empty">
                      <p>Nic tu jeszcze nie ma.</p>
                      <p className="predazzo-dash__results-empty-hint">Wyniki pojawią się po zakończeniu pierwszych skoków.</p>
                    </div>
                  ) : (
                    <>
                      <h3 className="predazzo-dash__results-table-title">Ostatni konkurs — wyniki</h3>
                      <div className="predazzo-dash__results-table-placeholder">Tabela wyników (wkrótce)</div>
                    </>
                  )}
                </section>
                {showSecondTable && (
                  <section className="predazzo-dash__results-table">
                    <h3 className="predazzo-dash__results-table-title">Ostatni trening / seria próbna — wyniki</h3>
                    <div className="predazzo-dash__results-table-placeholder">Tabela wyników (wkrótce)</div>
                  </section>
                )}
              </div>
            </aside>
          </div>
        </div>

        <div className="predazzo-dash__view-archive">
          <div className="predazzo-dash__archive-placeholder">
            <ArchiveIcon />
            <p>Archiwum wyników — wkrótce</p>
          </div>
        </div>
      </div>
    </div>
  );
};

function BackIcon(): JSX.Element {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  );
}

function TrophyIcon(): JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </svg>
  );
}

function ArchiveIcon(): JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect width="20" height="5" x="2" y="3" rx="1" />
      <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
      <path d="M10 12h4" />
    </svg>
  );
}
