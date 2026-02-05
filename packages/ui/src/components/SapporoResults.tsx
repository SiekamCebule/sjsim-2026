import type { JSX } from 'react';
import { useMemo, useState } from 'react';
import {
  runSapporoWeekend,
  createDefaultRandom,
  applyFormChangeToRoster,
  FORM_CHANGE_ALPHA,
  HILL_PARAMS,
} from '@sjsim/core';
import type {
  SapporoSingleSeriesStep,
  SapporoTwoSeriesStep,
  SapporoWeekendResult,
} from '@sjsim/core';
import { buildSapporoRoster } from '../data/sapporoData';
import { countryToFlag } from '../data/jumpersData';
import type { GameConfigState } from './GameConfig';
import './sapporo-results.css';

/** Krótka etykieta zakładki dla danego kroku (kolejność jak w steps). */
function stepTabLabel(step: { day: string; eventLabel: string; seriesLabel: string }, index: number): string {
  const dayShort = step.day === 'friday' ? 'Pt' : step.day === 'saturday' ? 'Sb' : step.day === 'sunday' ? 'Nd' : step.day;
  if (step.eventLabel === 'Trening') {
    const n = step.seriesLabel ? step.seriesLabel.replace('Seria ', '') : String(index + 1);
    return `${dayShort} Tr.${n}`;
  }
  if (step.eventLabel === 'Kwalifikacje') return `${dayShort} Kw.`;
  if (step.eventLabel === 'Seria próbna') return `${dayShort} Próbna`;
  if (step.eventLabel === 'Konkurs indywidualny') {
    return step.seriesLabel === 'Wyniki końcowe' ? `${dayShort} Kon.` : `${dayShort} Kon.1`;
  }
  return `${dayShort} ${index + 1}`;
}

/** Kraj z jumperId (format: "XXX-Name-Surname"). */
function countryFromJumperId(id: string): string {
  const first = id.split('-')[0];
  return first ?? id;
}

/** Imię i nazwisko z jumperId (format: "XXX-Name-Surname" → "Name Surname"). */
function jumperDisplayName(id: string): string {
  const parts = id.split('-');
  if (parts.length < 2) return id;
  return parts.slice(1).join(' ');
}

function valColorClass(v: number, prefix: 'wind' | 'comp'): string {
  return `competition-screen__val competition-screen__val--${prefix}-${v > 0 ? 'pos' : v < 0 ? 'neg' : 'zero'}`;
}

function formatStylePoints(value: number): string {
  const rounded = Math.round(value * 2) / 2;
  return rounded.toFixed(1);
}

function formatStyleNotes(notes?: number[] | null): string {
  if (!notes || notes.length === 0) return '—';
  return notes.map((note) => formatStylePoints(note)).join(' | ');
}

type SapporoDetails =
  | {
    kind: 'single';
    step: SapporoSingleSeriesStep;
    row: SapporoSingleSeriesStep['rows'][number];
    steps: SapporoWeekendResult['steps'];
  }
  | {
    kind: 'two';
    step: SapporoTwoSeriesStep;
    row: SapporoTwoSeriesStep['rows'][number];
    steps: SapporoWeekendResult['steps'];
    jumpIndex?: 1 | 2;
  };

function getRound1Positions(
  steps: SapporoWeekendResult['steps'],
  step: SapporoTwoSeriesStep
): Map<string, number> {
  const round1 = steps.find(
    (s) =>
      s.kind === 'single' &&
      s.day === step.day &&
      s.eventLabel === step.eventLabel &&
      s.seriesLabel === 'Seria 1'
  ) as SapporoSingleSeriesStep | undefined;
  if (!round1) return new Map();
  const map = new Map<string, number>();
  round1.rows.forEach((row) => map.set(row.jumperId, row.position));
  return map;
}

function getRound2Positions(step: SapporoTwoSeriesStep): Map<string, number> {
  const rows = step.rows
    .filter((row) => row.jump2 != null && row.jump2Points != null)
    .map((row) => ({
      jumperId: row.jumperId,
      bib: row.bib,
      points: row.jump2Points ?? row.jump2?.points ?? 0,
    }))
    .sort((a, b) => (b.points - a.points) || (b.bib - a.bib));
  const map = new Map<string, number>();
  rows.forEach((row, idx) => map.set(row.jumperId, idx + 1));
  return map;
}

function SapporoJumpDetails({
  details,
  onClose,
}: {
  details: SapporoDetails;
  onClose: () => void;
}): JSX.Element {
  const isTwo = details.kind === 'two';
  const scoring = HILL_PARAMS['sapporo-hs137']!;
  const includeStyle = details.step.eventLabel !== 'Trening' && details.step.eventLabel !== 'Seria próbna';
  const rowAny = details.row as typeof details.row & {
    jump1Distance?: number;
    jump1Points?: number;
    jump1?: {
      distance: number;
      points: number;
      gateDelta: number;
      wind: { average: number; instability: number };
      landing: number;
      stylePoints?: number;
      styleNotes?: number[];
    };
    jump2?: {
      distance: number;
      points: number;
      gateDelta: number;
      wind: { average: number; instability: number };
      landing: number;
      stylePoints?: number;
      styleNotes?: number[];
    } | null;
  };
  const fallbackWind = { average: 0, instability: 0 };
  const preferredJump =
    details.kind === 'two'
      ? details.jumpIndex ?? (rowAny.jump2 ? 2 : 1)
      : 1;
  const chosen = (isTwo
    ? (preferredJump === 2 ? rowAny.jump2 ?? rowAny.jump1 : rowAny.jump1 ?? rowAny.jump2) ?? {
      distance: rowAny.jump1Distance ?? 0,
      points: rowAny.jump1Points ?? 0,
      gateDelta: 0,
      wind: fallbackWind,
      landing: 'telemark',
    }
    : rowAny) as {
      distance: number;
      points: number;
      gateDelta?: number;
      wind?: { average: number; instability: number };
      landing: 'telemark' | 'parallel' | 'touchDown' | 'fall';
      stylePoints?: number;
      styleNotes?: number[];
    };
  const wind = chosen.wind ?? fallbackWind;
  const gateDelta = chosen.gateDelta ?? 0;
  const baseGate = isTwo ? (rowAny.jump2 ? details.step.gate2 : details.step.gate1) : details.step.gate;
  const gateValue = baseGate + gateDelta;
  const finalStep = details.steps.find(
    (s) =>
      s.kind === 'two' &&
      s.day === details.step.day &&
      s.eventLabel === details.step.eventLabel &&
      s.seriesLabel === 'Wyniki końcowe'
  ) as SapporoTwoSeriesStep | undefined;
  const hasTwoSeries = Boolean(finalStep);
  const canShowRoundPosition =
    hasTwoSeries && (details.step.seriesLabel === 'Seria 1' || isTwo);
  const round1Positions = finalStep ? getRound1Positions(details.steps, finalStep) : null;
  const round2Positions = finalStep ? getRound2Positions(finalStep) : null;
  const round1Position = round1Positions?.get(details.row.jumperId) ?? null;
  const round2Position = round2Positions?.get(details.row.jumperId) ?? null;
  const roundLabel = 'Pozycja w rundzie';
  const roundPosition =
    details.step.seriesLabel === 'Seria 1'
      ? details.row.position
      : (preferredJump === 2 ? round2Position : round1Position);
  const windPoints =
    wind.average >= 0
      ? -wind.average * scoring.windHeadwindPerMs
      : Math.abs(wind.average) * scoring.windTailwindPerMs;
  const gatePoints = -gateDelta * scoring.pointsPerGate;

  return (
    <>
      <div
        className="competition-screen__tooltip-backdrop"
        onClick={onClose}
        aria-hidden
      />
      <div
        className="competition-screen__tooltip"
        style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}
        role="dialog"
      >
        <div className="competition-screen__details-content">
          <div className="competition-screen__details-header">
            <span className="competition-screen__details-name">
              {countryToFlag(countryFromJumperId(details.row.jumperId))} {jumperDisplayName(details.row.jumperId)}
            </span>
            <span className="competition-screen__details-bib">{details.row.bib}</span>
          </div>
          <div className="competition-screen__details-hero">
            <span>Odległość</span>
            <strong>{chosen.distance.toFixed(1)} m</strong>
            <span>Miejsce</span>
            <strong>{details.row.position}</strong>
            {canShowRoundPosition && (
              <>
                <span>{roundLabel}</span>
                <strong>{roundPosition ?? '—'}</strong>
              </>
            )}
            <span>Punkty</span>
            <strong>{chosen.points.toFixed(1)}</strong>
          </div>
          <div className="competition-screen__details-grid">
            <span>Wiatr (avg)</span>
            <strong className={valColorClass(wind.average, 'wind')}>
              {wind.average.toFixed(2)} m/s
            </strong>
            <span>Belka</span>
            <strong>
              {gateValue}
              {gateDelta !== 0 && (
                <span className={`competition-screen__gate-delta competition-screen__gate-delta--${gateDelta > 0 ? 'plus' : 'minus'}`}>
                  {' '}({gateDelta > 0 ? '+' : ''}{gateDelta})
                </span>
              )}
            </strong>
            <span>Rek. wiatr</span>
            <strong className={valColorClass(windPoints, 'comp')}>
              {windPoints.toFixed(1)}
            </strong>
            <span>Rek. belka</span>
            <strong className={valColorClass(gatePoints, 'comp')}>
              {gatePoints.toFixed(1)}
            </strong>
            {includeStyle && (
              <>
                <span>Noty</span>
                <strong>{chosen.stylePoints != null ? formatStylePoints(chosen.stylePoints) : '—'}</strong>
                <div className="competition-screen__style-notes-row">
                  <strong className="competition-screen__style-notes">{formatStyleNotes(chosen.styleNotes)}</strong>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

/** Kompaktowy podgląd wyników Sapporo (do użycia np. na ekranie powołań). */
export interface SapporoResultsPreviewProps {
  result: SapporoWeekendResult | null;
  error: string | null;
  selectedStepIndex: number;
  onStepChange: (index: number) => void;
  highlightCountry: string | null;
}

export const SapporoResultsPreview = ({
  result,
  error,
  selectedStepIndex,
  onStepChange,
  highlightCountry,
}: SapporoResultsPreviewProps): JSX.Element => {
  const highlightRow = (jumperId: string): boolean =>
    Boolean(highlightCountry && countryFromJumperId(jumperId) === highlightCountry);
  const [details, setDetails] = useState<SapporoDetails | null>(null);

  if (error || !result) {
    return (
      <div className="sapporo-preview">
        <h3 className="sapporo-preview__title">Wyniki Sapporo</h3>
        <p className="sapporo-preview__meta">
          {error ?? 'Brak danych'}
        </p>
      </div>
    );
  }

  const allSteps = result.steps;
  const steps = allSteps.filter(
    (step) => !(step.eventLabel === 'Konkurs indywidualny' && step.seriesLabel === 'Seria 1')
  );
  const step = steps[selectedStepIndex];
  const dayNames: Record<string, string> = { friday: 'Piątek', saturday: 'Sobota', sunday: 'Niedziela' };
  const phaseTitle = step
    ? [dayNames[step.day], step.eventLabel, step.seriesLabel].filter(Boolean).join(' · ')
    : '';

  return (
    <div className="sapporo-preview">
      <h3 className="sapporo-preview__title">Wyniki Sapporo</h3>
      <div className="sapporo-preview__controls">
        <label className="sapporo-preview__label">
          Faza:
          <select
            className="sapporo-preview__select"
            value={selectedStepIndex}
            onChange={(e) => onStepChange(Number(e.target.value))}
            aria-label="Wybierz fazę"
          >
            {steps.map((s, i) => (
              <option key={i} value={i}>
                {stepTabLabel(s, i)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {step && (
        <div className="sapporo-preview__table-wrap">
          <p className="sapporo-preview__phase" aria-hidden>
            {phaseTitle}
          </p>
          {step.kind === 'single' ? (
            <SingleSeriesTable
              step={step}
              highlightRow={highlightRow}
              onRowClick={(row) => setDetails({ kind: 'single', step, row, steps: allSteps })}
            />
          ) : (
            <TwoSeriesTable
              step={step}
              highlightRow={highlightRow}
              onRowClick={(row, jumpIndex) => setDetails({ kind: 'two', step, row, steps: allSteps, jumpIndex })}
            />
          )}
        </div>
      )}
      {details && <SapporoJumpDetails details={details} onClose={() => setDetails(null)} />}
    </div>
  );
};

interface SapporoResultsProps {
  config: GameConfigState;
  /** Wywoływane przy przejściu dalej; przekazuje wynik weekendu (null przy błędzie). */
  onComplete: (result: SapporoWeekendResult | null) => void;
  /** Wywoływane przy cofnięciu do menu (po potwierdzeniu w dialogu). */
  onBack?: () => void;
}

export const SapporoResults = ({ config, onComplete, onBack }: SapporoResultsProps): JSX.Element => {
  const [showExitDialog, setShowExitDialog] = useState(false);
  const [details, setDetails] = useState<SapporoDetails | null>(null);
  const { result, error } = useMemo(() => {
    try {
      const { roster, worldCupOrderIds } = buildSapporoRoster();
      const random = createDefaultRandom();
      const rosterWithForm = applyFormChangeToRoster(
        roster,
        FORM_CHANGE_ALPHA.sapporoGameStart,
        random
      );
      const res = runSapporoWeekend({
        roster: rosterWithForm,
        worldCupOrderIds,
        random,
      });
      return { result: res, error: null as string | null };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return { result: null, error: message };
    }
  }, []);

  /** Ostatni odblokowany krok (0-based). Dalej dodaje kolejny. */
  const [stepIndex, setStepIndex] = useState(0);
  /** Która zakładka jest wybrana do podglądu (można przełączać na wcześniejsze fazy). */
  const [selectedTabIndex, setSelectedTabIndex] = useState(0);

  if (error || !result) {
    return (
      <div className="sapporo-results">
        <header className="sapporo-results__header">
          <h1 className="sapporo-results__title">Sapporo</h1>
          <p className="sapporo-results__meta" style={{ color: 'var(--color-accent)' }}>
            Nie udało się załadować wyników. {error ?? 'Brak danych'}
          </p>
        </header>
        <div className="sapporo-results__actions">
          <button type="button" className="sapporo-results__btn sapporo-results__btn--primary" onClick={() => onComplete(null)}>
            Kontynuuj
          </button>
        </div>
      </div>
    );
  }

  const allSteps = result.steps;
  const steps = allSteps.filter(
    (step) => !(step.eventLabel === 'Konkurs indywidualny' && step.seriesLabel === 'Seria 1')
  );
  const unlockedCount = stepIndex + 1;
  const visibleSteps = steps.slice(0, unlockedCount);
  const stepToShow = steps[selectedTabIndex];
  const isLastStep = stepIndex >= steps.length - 1;
  const isCoachWithCountry = config.mode === 'coach' && config.selectedCountry != null;

  const handleNext = (): void => {
    if (isLastStep) {
      onComplete(result);
    } else {
      const next = stepIndex + 1;
      setStepIndex(next);
      setSelectedTabIndex(next);
    }
  };

  if (!stepToShow) {
    return (
      <div className="sapporo-results">
        <p>Brak wyników.</p>
        <button type="button" className="sapporo-results__btn" onClick={() => onComplete(result ?? null)}>
          Kontynuuj
        </button>
      </div>
    );
  }

  const highlightRow = (jumperId: string): boolean =>
    Boolean(isCoachWithCountry && countryFromJumperId(jumperId) === config.selectedCountry);

  const dayNames: Record<string, string> = { friday: 'Piątek', saturday: 'Sobota', sunday: 'Niedziela' };
  const phaseTitle = [
    dayNames[stepToShow.day],
    stepToShow.eventLabel,
    stepToShow.seriesLabel,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="sapporo-results">
      {showExitDialog && (
        <div
          className="sapporo-results__dialog-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sapporo-exit-dialog-title"
        >
          <div className="sapporo-results__dialog">
            <h2 id="sapporo-exit-dialog-title" className="sapporo-results__dialog-title">
              Wrócić do menu?
            </h2>
            <p className="sapporo-results__dialog-text">
              Obecna rozgrywka zostanie anulowana. Czy na pewno chcesz wyjść do menu głównego?
            </p>
            <div className="sapporo-results__dialog-actions">
              <button
                type="button"
                className="sapporo-results__btn sapporo-results__btn--secondary"
                onClick={() => setShowExitDialog(false)}
              >
                Anuluj
              </button>
              <button
                type="button"
                className="sapporo-results__btn sapporo-results__btn--primary"
                onClick={() => onBack?.()}
              >
                Wróć do menu
              </button>
            </div>
          </div>
        </div>
      )}
      {details && <SapporoJumpDetails details={details} onClose={() => setDetails(null)} />}
      <header className="sapporo-results__header">
        {onBack && (
          <button
            type="button"
            className="sapporo-results__back"
            onClick={() => setShowExitDialog(true)}
            aria-label="Wstecz"
          >
            <BackIcon />
          </button>
        )}
        <div className="sapporo-results__header-inner">
          <h1 className="sapporo-results__title">Wyniki Sapporo</h1>
          <p className="sapporo-results__subtitle">
            Puchar Świata · 16–18 stycznia · HS137
          </p>
        </div>
      </header>

      <div className="sapporo-results__tabs" role="tablist">
        {visibleSteps.map((s, i) => (
          <button
            key={i}
            type="button"
            role="tab"
            aria-selected={selectedTabIndex === i}
            className={`sapporo-results__tab ${selectedTabIndex === i ? 'sapporo-results__tab--active' : ''}`}
            onClick={() => setSelectedTabIndex(i)}
          >
            {stepTabLabel(s, i)}
          </button>
        ))}
      </div>

      <section className="sapporo-results__panel" role="tabpanel" aria-label={phaseTitle}>
        <div className="sapporo-results__panel-head">
          <h2 className="sapporo-results__phase-title">{phaseTitle}</h2>
          {/* {stepToShow.kind === 'single' && (
            <span className="sapporo-results__meta">Belka {stepToShow.gate}</span>
          )} */}
          {/* {stepToShow.kind === 'two' && (
            <span className="sapporo-results__meta">
              Belka {stepToShow.gate1} / {stepToShow.gate2}
            </span>
          )} */}
        </div>
        {/* {isCoachWithCountry && (
          <p className="sapporo-results__legend">
            <span className="sapporo-results__legend-dot" aria-hidden /> Twoja kadra ({config.selectedCountry}) podświetlona
          </p>
        )} */}
        <div className="sapporo-results__table-wrap">
          {stepToShow.kind === 'single' ? (
            <SingleSeriesTable
              step={stepToShow}
              highlightRow={highlightRow}
              onRowClick={(row) => setDetails({ kind: 'single', step: stepToShow, row, steps: allSteps })}
            />
          ) : (
            <TwoSeriesTable
              step={stepToShow}
              highlightRow={highlightRow}
              onRowClick={(row, jumpIndex) => setDetails({ kind: 'two', step: stepToShow, row, steps: allSteps, jumpIndex })}
            />
          )}
        </div>
      </section>

      <footer className="sapporo-results__footer">
        <span className="sapporo-results__progress">
          Faza {unlockedCount} z {steps.length}
        </span>
        <button
          type="button"
          className="sapporo-results__btn sapporo-results__btn--primary"
          onClick={handleNext}
        >
          {isLastStep ? 'Kontynuuj' : 'Dalej'}
        </button>
      </footer>
    </div>
  );
};

interface SingleSeriesTableProps {
  step: SapporoSingleSeriesStep;
  highlightRow: (jumperId: string) => boolean;
  onRowClick?: (row: SapporoSingleSeriesStep['rows'][number]) => void;
}

function SingleSeriesTable({ step, highlightRow, onRowClick }: SingleSeriesTableProps): JSX.Element {
  return (
    <table className="sapporo-results__table" role="grid">
      <thead>
        <tr>
          <th scope="col" className="sapporo-results__cell-pos">M.</th>
          <th scope="col" className="sapporo-results__cell-zawodnik">Zawodnik</th>
          <th scope="col" className="sapporo-results__cell-num">Skok</th>
          <th scope="col" className="sapporo-results__cell-num">Punkty</th>
        </tr>
      </thead>
      <tbody>
        {step.rows.map((row) => (
          <tr
            key={`${row.bib}-${row.jumperId}`}
            className={[
              highlightRow(row.jumperId) ? 'sapporo-results__row--highlight' : '',
              onRowClick ? 'sapporo-results__row--clickable' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
          >
            <td className="sapporo-results__cell-pos">{row.position}</td>
            <td className="sapporo-results__cell-zawodnik">
              <span className="sapporo-results__flag" aria-hidden>
                {countryToFlag(countryFromJumperId(row.jumperId))}
              </span>
              <span className="sapporo-results__jumper-name">{jumperDisplayName(row.jumperId)}</span>
            </td>
            <td className="sapporo-results__cell-num">{row.distance.toFixed(1)} m</td>
            <td className="sapporo-results__cell-num">{row.points.toFixed(1)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

interface TwoSeriesTableProps {
  step: SapporoTwoSeriesStep;
  highlightRow: (jumperId: string) => boolean;
  onRowClick?: (row: SapporoTwoSeriesStep['rows'][number], jumpIndex?: 1 | 2) => void;
}

function TwoSeriesTable({ step, highlightRow, onRowClick }: TwoSeriesTableProps): JSX.Element {
  return (
    <table className="sapporo-results__table" role="grid">
      <thead>
        <tr>
          <th scope="col" className="sapporo-results__cell-pos">M.</th>
          <th scope="col" className="sapporo-results__cell-bib">BIB</th>
          <th scope="col" className="sapporo-results__cell-zawodnik">Zawodnik</th>
          <th scope="col" className="sapporo-results__cell-num">Skok 1</th>
          <th scope="col" className="sapporo-results__cell-num">Skok 2</th>
          <th scope="col" className="sapporo-results__cell-num">Suma</th>
        </tr>
      </thead>
      <tbody>
        {step.rows.map((row) => (
          <tr
            key={`${row.bib}-${row.jumperId}`}
            className={[
              highlightRow(row.jumperId) ? 'sapporo-results__row--highlight' : '',
              onRowClick ? 'sapporo-results__row--clickable' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={
              onRowClick
                ? () => onRowClick(row, row.jump2Distance != null ? 2 : 1)
                : undefined
            }
          >
            <td className="sapporo-results__cell-pos">{row.position}</td>
            <td className="sapporo-results__cell-bib">{row.bib}</td>
            <td className="sapporo-results__cell-zawodnik">
              <span className="sapporo-results__flag" aria-hidden>
                {countryToFlag(countryFromJumperId(row.jumperId))}
              </span>
              <span className="sapporo-results__jumper-name">{jumperDisplayName(row.jumperId)}</span>
            </td>
            <td
              className="sapporo-results__cell-num"
              onClick={
                onRowClick
                  ? (e) => {
                    e.stopPropagation();
                    onRowClick(row, 1);
                  }
                  : undefined
              }
            >
              {row.jump1Distance.toFixed(1)} m
            </td>
            <td
              className="sapporo-results__cell-num"
              onClick={
                onRowClick && row.jump2Distance != null
                  ? (e) => {
                    e.stopPropagation();
                    onRowClick(row, 2);
                  }
                  : undefined
              }
            >
              {row.jump2Distance != null ? `${row.jump2Distance.toFixed(1)} m` : '—'}
            </td>
            <td className="sapporo-results__cell-num sapporo-results__cell-total">
              {row.total.toFixed(1)} pkt
            </td>
          </tr>
        ))}
      </tbody>
    </table>
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
