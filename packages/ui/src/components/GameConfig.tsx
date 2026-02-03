import type { JSX } from 'react';
import { useMemo, useState } from 'react';
import {
  countryToFlag,
  getJumpersByCountry,
  getLimitForCountry,
  getMenCountries,
  getRealRosterForCountry,
  type Jumper
} from '../data/jumpersData';
import './game-config.css';

export type GameMode = 'director' | 'coach';
export type DirectorStart = 'sapporo' | 'olympics';
export type CoachCallUps = 'own' | 'real';
export type CoachStart = 'sapporo' | 'real-form';

export interface GameConfigState {
  mode: GameMode;
  directorStart: DirectorStart;
  coachCallUps: CoachCallUps;
  coachStart: CoachStart;
  /** Wybrany kraj (kadra użytkownika). Tylko gdy powołania własne lub real-form. */
  selectedCountry: string | null;
  /** Wybrani skoczkowie (mężczyźni) dla selectedCountry. Pusta = realny skład. */
  selectedJumpers: Jumper[];
}

type StepId =
  | 'mode'
  | 'director-start'
  | 'coach-callups'
  | 'coach-start'
  | 'callups-country'
  | 'callups-list'
  | 'done';

const defaultConfig: GameConfigState = {
  mode: 'director',
  directorStart: 'sapporo',
  coachCallUps: 'real',
  coachStart: 'sapporo',
  selectedCountry: null,
  selectedJumpers: []
};

interface GameConfigProps {
  onBack: () => void;
  onStart?: (config: GameConfigState) => void;
}

export const GameConfig = ({ onBack, onStart }: GameConfigProps): JSX.Element => {
  const [config, setConfig] = useState<GameConfigState>(defaultConfig);
  const [stepHistory, setStepHistory] = useState<StepId[]>(['mode']);

  const currentStep = stepHistory[stepHistory.length - 1]!;

  const nextStep = useMemo((): StepId | null => {
    switch (currentStep) {
      case 'mode':
        return config.mode === 'director' ? 'director-start' : 'coach-callups';
      case 'director-start':
        return 'done';
      case 'coach-callups':
        return 'coach-start';
      case 'coach-start':
        return 'callups-country';
      case 'callups-country':
        return config.coachStart === 'real-form' ? 'callups-list' : 'done';
      case 'callups-list':
        return 'done';
      default:
        return null;
    }
  }, [currentStep, config.mode, config.coachStart]);

  const goNext = (): void => {
    if (nextStep) setStepHistory((h) => [...h, nextStep]);
  };

  const goBack = (): void => {
    if (stepHistory.length <= 1) {
      onBack();
      return;
    }
    setStepHistory((h) => h.slice(0, -1));
  };

  const canProceed =
    currentStep === 'done' ||
    (currentStep === 'mode' && config.mode) ||
    (currentStep === 'director-start' && config.directorStart) ||
    (currentStep === 'coach-callups' && config.coachCallUps) ||
    (currentStep === 'coach-start' && config.coachStart) ||
    (currentStep === 'callups-country' && config.selectedCountry);

  const handleStart = (): void => {
    onStart?.(config);
  };

  return (
    <div className="game-config">
      <header className="game-config__header">
        <button
          type="button"
          className="game-config__back"
          onClick={goBack}
          aria-label="Wstecz"
        >
          <BackIcon />
        </button>
        <div className="game-config__title-block">
          <h1 className="game-config__title">Konfiguracja rozgrywki</h1>
          <p className="game-config__subtitle">{stepIdToLabel(currentStep)}</p>
        </div>
      </header>

      <section
        className={`game-config__content game-config__content--step ${currentStep === 'callups-country' ? 'game-config__content--wide' : ''}`}
      >
        {currentStep === 'mode' && (
          <StepScreen
            title="Tryb gry"
            hint="Jako Dyrektor obserwujesz zawody i masz wpływ na belkę. Jako Trener wybierasz kadrę i prowadzisz ją; tylko mężczyźni mają wcześniejsze konkursy przed Olimpiadą."
            options={[
              {
                value: 'director',
                title: 'Zostań Dyrektorem',
                desc: 'Obserwujesz zawody (God Mode). Wpływ na belkę w konkursie.',
                checked: config.mode === 'director',
                icon: <DirectorIcon />
              },
              {
                value: 'coach',
                title: 'Zostań Trenerem',
                desc: 'Wybierasz zawodników i prowadzisz kadrę.',
                checked: config.mode === 'coach',
                icon: <CoachIcon />
              }
            ]}
            onSelect={(value) => setConfig((c) => ({ ...c, mode: value as GameMode }))}
            onNext={goNext}
            canProceed={!!config.mode}
            onBack={goBack}
          />
        )}

        {currentStep === 'director-start' && (
          <StepScreen
            title="Data rozpoczęcia"
            hint="Od Sapporo: losowa forma i fikcyjne wyniki od konkursów w Sapporo. Od razu Olimpiada: start w Predazzo bez wcześniejszych konkursów."
            options={[
              {
                value: 'sapporo',
                title: 'Od konkursów w Sapporo',
                desc: 'Losowa forma i fikcyjne wyniki od Sapporo.',
                checked: config.directorStart === 'sapporo',
                icon: <CalendarIcon />
              },
              {
                value: 'olympics',
                title: 'Od razu Olimpiada',
                desc: 'Start w Predazzo bez wcześniejszych konkursów.',
                checked: config.directorStart === 'olympics',
                icon: <TrophyIcon />
              }
            ]}
            onSelect={(value) =>
              setConfig((c) => ({ ...c, directorStart: value as DirectorStart }))
            }
            onNext={goNext}
            canProceed={!!config.directorStart}
            onBack={goBack}
          />
        )}

        {currentStep === 'coach-callups' && (
          <StepScreen
            title="Powołania"
            hint="Własne: sam decydujesz, kto jedzie. Prawdziwe: kadra jak w rzeczywistości (skład żeński jest zawsze ustalony z góry)."
            options={[
              {
                value: 'own',
                title: 'Powołaj skoczków samemu',
                desc: 'Sam decydujesz, kto jedzie na zawody.',
                checked: config.coachCallUps === 'own',
                icon: <HandEditIcon />
              },
              {
                value: 'real',
                title: 'Kadra jak w rzeczywistości',
                desc: 'Skład taki jak w realnych powołaniach.',
                checked: config.coachCallUps === 'real',
                icon: <ListIcon />
              }
            ]}
            onSelect={(value) =>
              setConfig((c) => ({ ...c, coachCallUps: value as CoachCallUps }))
            }
            onNext={goNext}
            canProceed={!!config.coachCallUps}
            onBack={goBack}
          />
        )}

        {currentStep === 'coach-start' && (
          <StepScreen
            title="Początek rozgrywki"
            hint="Od Sapporo: symulacja konkursów przed Olimpiadą, forma może się nieco zmienić. Na bazie realnej formy: bez symulacji Sapporo, Olimpiada startuje na realnej klasyfikacji PŚ."
            options={[
              {
                value: 'sapporo',
                title: 'Zacznij od Sapporo',
                desc: 'Symulacja konkursów przed Olimpiadą. Forma może się zmienić.',
                checked: config.coachStart === 'sapporo',
                icon: <CalendarIcon />
              },
              {
                value: 'real-form',
                title: 'Powołania na bazie realnej formy',
                desc: 'Bez symulacji Sapporo. Olimpiada na realnej klasyfikacji PŚ.',
                checked: config.coachStart === 'real-form',
                icon: <ChartIcon />
              }
            ]}
            onSelect={(value) =>
              setConfig((c) => ({ ...c, coachStart: value as CoachStart }))
            }
            onNext={goNext}
            canProceed={!!config.coachStart}
            onBack={goBack}
          />
        )}

        {currentStep === 'callups-country' && (
          <CallupsCountryStep
            config={config}
            setConfig={setConfig}
            onNext={goNext}
            onBack={goBack}
          />
        )}

        {currentStep === 'callups-list' && config.selectedCountry && (
          <CallupsListStep
            country={config.selectedCountry}
            limit={getLimitForCountry(config.selectedCountry)}
            realRoster={getRealRosterForCountry(config.selectedCountry)}
            allJumpers={getJumpersByCountry(config.selectedCountry)}
            coachCallUps={config.coachCallUps}
            selectedJumpers={config.selectedJumpers}
            setSelectedJumpers={(jumpers) =>
              setConfig((c) => ({ ...c, selectedJumpers: jumpers }))
            }
            onNext={goNext}
            onBack={goBack}
          />
        )}

        {currentStep === 'done' && (
          <div className="game-config__step">
            <p className="game-config__step-hint">
              Konfiguracja gotowa. Możesz rozpocząć rozgrywkę.
            </p>
            <div className="game-config__actions game-config__actions--single">
              <button
                type="button"
                className="game-config__btn game-config__btn--primary"
                onClick={handleStart}
              >
                Rozpocznij rozgrywkę
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};

function stepIdToLabel(step: StepId): string {
  const labels: Record<StepId, string> = {
    mode: 'Tryb gry',
    'director-start': 'Data rozpoczęcia',
    'coach-callups': 'Powołania',
    'coach-start': 'Początek rozgrywki',
    'callups-country': 'Wybierz kadrę (kraj)',
    'callups-list': 'Skład kadry',
    done: 'Rozpocznij rozgrywkę'
  };
  return labels[step] ?? step;
}

interface StepOption {
  value: string;
  title: string;
  desc: string;
  checked: boolean;
  icon?: JSX.Element;
}

interface StepScreenProps {
  title: string;
  hint: string;
  options: StepOption[];
  onSelect: (value: string) => void;
  onNext: () => void;
  canProceed: boolean;
  onBack: () => void;
}

const StepScreen = ({
  title,
  hint,
  options,
  onSelect,
  onNext,
  canProceed,
  onBack
}: StepScreenProps): JSX.Element => (
  <div className="game-config__step">
    <h2 className="game-config__step-title">{title}</h2>
    <p className="game-config__step-hint">{hint}</p>
    <div className="game-config__options" role="radiogroup" aria-label={title}>
      {options.map((opt) => (
        <label
          key={opt.value}
          className={`game-config__option ${opt.checked ? 'game-config__option--checked' : ''}`}
        >
          <input
            type="radio"
            name={title}
            value={opt.value}
            checked={opt.checked}
            onChange={() => onSelect(opt.value)}
            className="game-config__option-input"
          />
          {opt.icon && <span className="game-config__option-icon">{opt.icon}</span>}
          <span className="game-config__option-content">
            <span className="game-config__option-title">{opt.title}</span>
            <span className="game-config__option-desc">{opt.desc}</span>
          </span>
        </label>
      ))}
    </div>
    <div className="game-config__step-actions">
      <button
        type="button"
        className="game-config__btn game-config__btn--secondary"
        onClick={onBack}
      >
        Wstecz
      </button>
      <button
        type="button"
        className="game-config__btn game-config__btn--primary"
        onClick={onNext}
        disabled={!canProceed}
      >
        Dalej
      </button>
    </div>
  </div>
);

interface CallupsCountryStepProps {
  config: GameConfigState;
  setConfig: React.Dispatch<React.SetStateAction<GameConfigState>>;
  onNext: () => void;
  onBack: () => void;
}

const CallupsCountryStep = ({
  config,
  setConfig,
  onNext,
  onBack
}: CallupsCountryStepProps): JSX.Element => {
  const countries = useMemo(() => getMenCountries(), []);
  const previewJumpers = config.selectedCountry
    ? getJumpersByCountry(config.selectedCountry)
    : [];
  const hintText =
    config.coachStart === 'real-form'
      ? 'Kadra, którą będziesz prowadzić. Skład żeński jest ustalony z góry. Wybierz kraj — w następnym kroku zatwierdzisz skład.'
      : 'Kadra, którą będziesz prowadzić. Powołania będą po wynikach konkursów; na razie wybierz kraj. Skład żeński jest ustalony z góry.';

  return (
    <div className="game-config__step">
      <h2 className="game-config__step-title">Wybierz kadrę (kraj)</h2>
      <p className="game-config__step-hint">{hintText}</p>
      <div className="game-config__country-step-layout">
        <div className="game-config__country-grid" role="listbox" aria-label="Kraj">
          {countries.map((code) => (
            <button
              key={code}
              type="button"
              className={`game-config__country-btn ${config.selectedCountry === code ? 'game-config__country-btn--selected' : ''}`}
              onClick={() =>
                setConfig((c) => ({
                  ...c,
                  selectedCountry: code,
                  selectedJumpers: getRealRosterForCountry(code)
                }))
              }
            >
              <span className="game-config__country-flag" aria-hidden>
                {countryToFlag(code)}
              </span>
              <span className="game-config__country-code">{code}</span>
            </button>
          ))}
        </div>
        {config.selectedCountry && (
          <div className="game-config__country-preview">
            <h3 className="game-config__country-preview-title">
              Skoczkowie: {config.selectedCountry}
            </h3>
            <ul className="game-config__jumper-preview-list" role="list">
              {previewJumpers.map((j) => (
                <li key={`${j.name}-${j.surname}`}>
                  {j.name} {j.surname}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <div className="game-config__step-actions">
        <button
          type="button"
          className="game-config__btn game-config__btn--secondary"
          onClick={onBack}
        >
          Wstecz
        </button>
        <button
          type="button"
          className="game-config__btn game-config__btn--primary"
          onClick={onNext}
          disabled={!config.selectedCountry}
        >
          Dalej
        </button>
      </div>
    </div>
  );
};

interface CallupsListStepProps {
  country: string;
  limit: number;
  realRoster: Jumper[];
  allJumpers: Jumper[];
  coachCallUps: CoachCallUps;
  selectedJumpers: Jumper[];
  setSelectedJumpers: (j: Jumper[]) => void;
  onNext: () => void;
  onBack: () => void;
}

function jumperKey(j: Jumper): string {
  return `${j.country}:${j.name}:${j.surname}`;
}

const CallupsListStep = ({
  country,
  limit,
  realRoster,
  allJumpers,
  coachCallUps,
  selectedJumpers,
  setSelectedJumpers,
  onNext,
  onBack
}: CallupsListStepProps): JSX.Element => {
  const isOwn = coachCallUps === 'own';
  const current = selectedJumpers.length ? selectedJumpers : realRoster;
  const requiredCount = Math.min(limit, allJumpers.length);
  const canProceed = !isOwn || current.length >= requiredCount;

  const toggle = (j: Jumper): void => {
    if (!isOwn) return;
    const key = jumperKey(j);
    const has = current.some((x) => jumperKey(x) === key);
    if (has) {
      setSelectedJumpers(current.filter((x) => jumperKey(x) !== key));
    } else if (current.length < limit) {
      setSelectedJumpers([...current, j]);
    }
  };

  return (
    <div className="game-config__step">
      <h2 className="game-config__step-title">Skoczkowie: {country}</h2>
      <p className="game-config__step-hint">
        {isOwn
          ? allJumpers.length < limit
            ? `Kraj ma mniej skoczków (${allJumpers.length}) niż limit (${limit}). Wybierz wszystkich dostępnych, aby przejść dalej.`
            : `Wybierz ${limit} skoczków (zaznacz/odznacz). Skład realny jest domyślnie zaznaczony.`
          : 'Skład prawdziwy.'}
      </p>
      <ul className="game-config__jumper-list" role="list">
        {allJumpers.map((j) => {
          const key = jumperKey(j);
          const isSelected = current.some((x) => jumperKey(x) === key);
          return (
            <li key={key}>
              {isOwn ? (
                <label className="game-config__jumper-row">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggle(j)}
                    disabled={!isSelected && current.length >= limit}
                  />
                  <span>
                    {j.name} {j.surname}
                  </span>
                </label>
              ) : (
                <span className="game-config__jumper-row game-config__jumper-row--readonly">
                  {j.name} {j.surname}
                  {isSelected ? ' ✓' : ''}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <div className="game-config__step-actions">
        <button
          type="button"
          className="game-config__btn game-config__btn--secondary"
          onClick={onBack}
        >
          Wstecz
        </button>
        <button
          type="button"
          className="game-config__btn game-config__btn--primary"
          onClick={onNext}
          disabled={!canProceed}
          title={!canProceed && isOwn ? `Wybierz ${requiredCount - current.length} skoczków więcej` : undefined}
        >
          Dalej
        </button>
      </div>
    </div>
  );
};

function DirectorIcon(): JSX.Element {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function CoachIcon(): JSX.Element {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function CalendarIcon(): JSX.Element {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
      <line x1="16" x2="16" y1="2" y2="6" />
      <line x1="8" x2="8" y1="2" y2="6" />
      <line x1="3" x2="21" y1="10" y2="10" />
    </svg>
  );
}

function TrophyIcon(): JSX.Element {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </svg>
  );
}

function HandEditIcon(): JSX.Element {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function ListIcon(): JSX.Element {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <line x1="8" x2="21" y1="6" y2="6" />
      <line x1="8" x2="21" y1="12" y2="12" />
      <line x1="8" x2="21" y1="18" y2="18" />
      <line x1="3" x2="3.01" y1="6" y2="6" />
      <line x1="3" x2="3.01" y1="12" y2="12" />
      <line x1="3" x2="3.01" y1="18" y2="18" />
    </svg>
  );
}

function ChartIcon(): JSX.Element {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <line x1="18" x2="18" y1="20" y2="10" />
      <line x1="12" x2="12" y1="20" y2="4" />
      <line x1="6" x2="6" y1="20" y2="14" />
    </svg>
  );
}

function BackIcon(): JSX.Element {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}
