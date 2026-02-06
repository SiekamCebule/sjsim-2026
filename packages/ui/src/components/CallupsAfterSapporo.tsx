import type { JSX } from 'react';
import { useState, useMemo } from 'react';
import {
  runSapporoWeekend,
  createDefaultRandom,
  applyFormChangeToRoster,
  FORM_CHANGE_ALPHA,
} from '@sjsim/core';
import type { SapporoWeekendResult } from '@sjsim/core';
import {
  getLimitForCountry,
  getRealRosterForCountry,
  getJumpersByCountry,
  getWorldCupOrderAll,
  countryCodeToName,
  type Jumper,
} from '../data/jumpersData';
import { buildSapporoRoster } from '../data/sapporoData';
import { computeAllBotCallups, getCountriesForCallups } from '../data/botCallups';
import { CountryFlag } from './CountryFlag';
import type { GameConfigState } from './GameConfig';
import { SapporoResultsPreview } from './SapporoResults';
import './game-config.css';
import './sapporo-results.css';

function jumperKey(j: Jumper): string {
  return `${j.country}:${j.name}:${j.surname}`;
}

function hasDetailedSapporoResult(result: SapporoWeekendResult | null): boolean {
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
}

export interface CallupsAfterSapporoProps {
  config: GameConfigState;
  /** Wynik weekendu Sapporo (z ekranu wyników) – używany do podglądu i powołań botów. */
  sapporoResult: SapporoWeekendResult | null;
  onComplete: (config: GameConfigState) => void;
  onBack: () => void;
  /** Gdy false, nie pokazuj tabeli wyników Sapporo po lewej (np. Dyrektor → Od razu Predazzo). */
  showSapporoPreview?: boolean;
}

export const CallupsAfterSapporo = ({
  config,
  sapporoResult: sapporoResultProp,
  onComplete,
  onBack,
  showSapporoPreview = true,
}: CallupsAfterSapporoProps): JSX.Element => {
  const isDirector = config.mode === 'director';
  const country = config.selectedCountry ?? '';

  const fallback = useMemo(() => {
    if (sapporoResultProp && hasDetailedSapporoResult(sapporoResultProp)) {
      return { result: sapporoResultProp, error: null as string | null };
    }
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
      const msg = e instanceof Error ? e.message : String(e);
      return { result: null, error: msg };
    }
  }, [sapporoResultProp]);

  const sapporoResult = (sapporoResultProp && hasDetailedSapporoResult(sapporoResultProp))
    ? sapporoResultProp
    : fallback.result;
  const sapporoError = fallback.error;

  const worldCupOrderIds = useMemo(() => getWorldCupOrderAll(), []);

  const allBotCallups = useMemo(() => {
    if (!sapporoResult || worldCupOrderIds.length === 0) return {};
    return computeAllBotCallups(sapporoResult, worldCupOrderIds, () => Math.random());
  }, [sapporoResult, worldCupOrderIds]);

  const [sapporoStepIndex, setSapporoStepIndex] = useState(() =>
    sapporoResult ? Math.max(0, sapporoResult.steps.length - 1) : 0
  );

  const limit = useMemo(() => getLimitForCountry(country), [country]);
  const realRoster = useMemo(() => getRealRosterForCountry(country), [country]);
  const allJumpers = useMemo(() => getJumpersByCountry(country), [country]);

  const [selectedJumpers, setSelectedJumpers] = useState<Jumper[]>(() =>
    config.selectedJumpers.length ? config.selectedJumpers : realRoster
  );

  const current = selectedJumpers.length ? selectedJumpers : realRoster;
  const requiredCount = Math.min(limit, allJumpers.length);
  const canProceed = isDirector || current.length >= requiredCount;

  const toggle = (j: Jumper): void => {
    const key = jumperKey(j);
    const has = current.some((x) => jumperKey(x) === key);
    if (has) {
      setSelectedJumpers(current.filter((x) => jumperKey(x) !== key));
    } else if (current.length < limit) {
      setSelectedJumpers([...current, j]);
    }
  };

  const handleConfirm = (): void => {
    if (isDirector) {
      onComplete({ ...config, allCallups: allBotCallups });
    } else {
      onComplete({
        ...config,
        selectedJumpers: current,
        allCallups: { ...allBotCallups, [country]: current },
      });
    }
  };

  const countries = useMemo(() => getCountriesForCallups(), []);

  const headerActions = (
    <div className="game-config__step-actions game-config__step-actions--header">
      <button type="button" className="game-config__btn game-config__btn--secondary" onClick={onBack}>
        Wstecz
      </button>
      <button
        type="button"
        className="game-config__btn game-config__btn--primary"
        onClick={handleConfirm}
        disabled={!canProceed}
        title={
          !canProceed ? `Wybierz ${requiredCount - current.length} skoczków więcej` : undefined
        }
      >
        Rozpocznij grę
      </button>
    </div>
  );

  return (
    <div
      className={`game-config game-config--with-sapporo ${!showSapporoPreview ? 'game-config--callups-only' : ''}`}
    >
      <header className="game-config__header game-config__header--with-actions">
        <button
          type="button"
          className="game-config__back"
          onClick={onBack}
          aria-label={showSapporoPreview ? 'Wstecz do wyników Sapporo' : 'Wstecz'}
        >
          <BackIcon />
        </button>
        <div className="game-config__title-block">
          <h1 className="game-config__title">Powołania na Predazzo</h1>
          <p className="game-config__subtitle">
            {isDirector
              ? showSapporoPreview
                ? 'Powołania kadr po Sapporo (wybór algorytmu)'
                : 'Powołania kadr (wybór algorytmu)'
              : 'Wybierz skład kadry po wynikach z Sapporo'}
          </p>
        </div>
        {headerActions}
      </header>

      <div className="game-config__with-preview">
        {showSapporoPreview && (
          <aside className="game-config__sapporo-aside" aria-label="Podgląd wyników Sapporo">
            <SapporoResultsPreview
              result={sapporoResult}
              error={sapporoError}
              selectedStepIndex={sapporoStepIndex}
              onStepChange={setSapporoStepIndex}
              highlightCountry={country || null}
            />
          </aside>
        )}
        <section className="game-config__content game-config__content--step">
          {isDirector ? (
            <div className="game-config__step">
              <h2 className="game-config__step-title">Powołania wszystkich kadr</h2>
              <div className="callups-all-teams">
                {countries.map((c) => {
                  const jumpers = allBotCallups[c] ?? [];
                  return (
                    <div key={c} className="callups-team">
                      <div className="callups-team__header">
                        <span className="game-config__country-flag" aria-hidden>
                          <CountryFlag country={c} />
                        </span>{' '}
                        <span className="callups-team__country">{countryCodeToName(c)}</span>
                      </div>
                      <div className="callups-team__names">
                        {jumpers.map((j) => (
                          <span key={jumperKey(j)} className="callups-team__name">
                            {j.name} {j.surname}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <>
              <div className="game-config__step">
                <h2 className="game-config__step-title">
                  <span className="game-config__country-flag" aria-hidden>
                    <CountryFlag country={country} />
                  </span>{' '}
                  <span className="callups-team__country">{countryCodeToName(country)}</span>
                </h2>
                <p className="game-config__step-hint">
                  {allJumpers.length < limit
                    ? `Kraj ma mniej skoczków (${allJumpers.length}) niż limit (${limit}). Wybierz wszystkich dostępnych.`
                    : `Wybierz ${limit} skoczków na konkursy w Predazzo. Skład realny jest domyślnie zaznaczony.`}
                </p>
                <ul className="game-config__jumper-list" role="list">
                  {allJumpers.map((j) => {
                    const key = jumperKey(j);
                    const isSelected = current.some((x) => jumperKey(x) === key);
                    return (
                      <li key={key}>
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
                      </li>
                    );
                  })}
                </ul>
              </div>
              <div className="game-config__step">
                <h2 className="game-config__step-title">Powołania innych kadr</h2>
                <div className="callups-all-teams">
                  {countries
                    .filter((c) => c !== country)
                    .map((c) => {
                      const jumpers = allBotCallups[c] ?? [];
                      return (
                        <div key={c} className="callups-team">
                          <div className="callups-team__header">
                            <span className="game-config__country-flag" aria-hidden>
                              <CountryFlag country={c} />
                            </span>{' '}
                            <span className="callups-team__country">{countryCodeToName(c)}</span>
                          </div>
                          <div className="callups-team__names">
                            {jumpers.map((j) => (
                              <span key={jumperKey(j)} className="callups-team__name">
                                {j.name} {j.surname}
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
};

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
