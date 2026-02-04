import type { JSX } from 'react';
import { useState, useMemo } from 'react';
import type { ScheduleItem, NextEventWeather } from '../data/predazzoSchedule';
import { getWeatherConditionLabel } from '../data/predazzoSchedule';
import { WEATHER_ICONS } from '../data/weatherIcons';
import { buildIndividualStartList, createDefaultRandom, type SimulationJumper } from '@sjsim/core';
import { countryToFlag, getMenTeams, getWomenTeams, getWorldCupOrderAll, getWomenWorldCupOrderAll, type Jumper } from '../data/jumpersData';
import type { GameConfigState } from './GameConfig';
import './competition-preview-dialog.css';

function formatEventShortLabel(item: ScheduleItem): string {
  const t = item.type === 'training' ? 'Trening' : 'Seria próbna';
  const g = item.gender === 'men' ? 'mężczyzn' : item.gender === 'women' ? 'kobiet' : '';
  return `${t} ${g}`.trim();
}

function WindSpeedWithDirection({ speed }: { speed: number }): JSX.Element {
  const abs = Math.abs(speed);
  const dirLabel = speed < 0 ? 'w plecy' : 'pod narty';
  return (
    <>
      {abs.toFixed(1)} m/s <em>{dirLabel}</em>
    </>
  );
}

function jumperKey(j: Jumper): string {
  return `${j.country}:${j.name}:${j.surname}`;
}

function jumperId(j: Jumper): string {
  return `${j.country}-${j.name}-${j.surname}`.replace(/\s+/g, '-');
}

function toSimulationJumper(j: Jumper): SimulationJumper {
  return {
    id: jumperId(j),
    skills: {
      smallHillSkill: j.aSkill ?? 5,
      bigHillSkill: j.bSkill ?? 5,
      landingTendency: j.landing ?? 0,
      form: j.form ?? 5,
      bonusImportantJumps: j.bonusImportantJumps ?? 0,
    },
    isWomen: j.gender === 'women',
  };
}

function variabilitySentence(v: number): JSX.Element {
  const phrase =
    v <= 0.04 ? 'bardzo przewidywalny' :
      v <= 0.2 ? 'raczej przewidywalny' :
        v <= 0.5 ? 'umiarkowanie zmienny' :
          v <= 0.75 ? 'trochę "kręcił"' :
            v <= 1.15 ? 'mocno zmienny' : 'skrajnie loteryjny';
  return <>Wiatr będzie <em>{phrase}</em>.</>;
}


function WeatherIcon({ condition }: { condition: NextEventWeather['condition'] }): JSX.Element {
  return (
    <img
      src={WEATHER_ICONS[condition]}
      alt=""
      className="comp-preview__weather-img"
      aria-hidden
    />
  );
}

function WindIcon(): JSX.Element {
  return (
    <svg className="comp-preview__wind-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2" />
    </svg>
  );
}

export interface CompetitionPreviewDialogProps {
  event: ScheduleItem;
  config: GameConfigState | null;
  weather: NextEventWeather;
  onConfirm: (params: {
    participating: Jumper[];
    autoBar: boolean;
  }) => void;
  onCancel: () => void;
}

export const CompetitionPreviewDialog = ({
  event,
  config,
  weather,
  onConfirm,
  onCancel,
}: CompetitionPreviewDialogProps): JSX.Element => {
  const isDirector = config?.mode === 'director';
  const coachCountry = config?.mode === 'coach' ? config.selectedCountry ?? '' : '';

  const fullStartList = useMemo(() => {
    const random = createDefaultRandom();
    if (event.gender === 'women') {
      const womenRoster = getWomenTeams();
      const simRoster = womenRoster.map(toSimulationJumper);
      const wcOrder = [...getWomenWorldCupOrderAll()].reverse();
      const startList = buildIndividualStartList(simRoster, wcOrder, random);
      const jumperById = new Map(womenRoster.map((j) => [jumperId(j), j]));
      return startList.map((entry) => jumperById.get(entry.jumper.id)!).filter(Boolean);
    }
    const callups = Object.values(config?.allCallups ?? {}).flat();
    const menRoster = callups.length > 0 ? callups : getMenTeams();
    const simRoster = menRoster.map(toSimulationJumper);
    const wcOrder = [...getWorldCupOrderAll()].reverse();
    const startList = buildIndividualStartList(simRoster, wcOrder, random);
    const jumperById = new Map(menRoster.map((j) => [jumperId(j), j]));
    return startList.map((entry) => jumperById.get(entry.jumper.id)!).filter(Boolean);
  }, [event.gender, config?.allCallups]);

  /** Dla trenera: którzy z jego kadry są powołani (można odznaczyć w treningu). */
  const coachRoster = useMemo(() => {
    if (!coachCountry) return [];
    return fullStartList.filter((j) => j.country === coachCountry);
  }, [fullStartList, coachCountry]);

  /** Zaznaczeni do startu — domyślnie wszyscy; trener może odznaczyć swoich. */
  const [participatingKeys, setParticipatingKeys] = useState<Set<string>>(() => {
    const s = new Set<string>();
    fullStartList.forEach((j) => s.add(jumperKey(j)));
    return s;
  });

  /** Zaznaczone = ręcznie ustawiać belkę. Domyślnie auto. */
  const [manualBar, setManualBar] = useState(false);

  const participating = useMemo(
    () => fullStartList.filter((j) => participatingKeys.has(jumperKey(j))),
    [fullStartList, participatingKeys]
  );

  const toggleParticipating = (j: Jumper): void => {
    const key = jumperKey(j);
    setParticipatingKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const selectAllCoach = (): void => {
    setParticipatingKeys((prev) => {
      const next = new Set(prev);
      coachRoster.forEach((j) => next.add(jumperKey(j)));
      return next;
    });
  };

  const deselectAllCoach = (): void => {
    setParticipatingKeys((prev) => {
      const next = new Set(prev);
      coachRoster.forEach((j) => next.delete(jumperKey(j)));
      return next;
    });
  };

  const athleteLabel = event.gender === 'women' ? 'zawodniczek' : 'zawodników';

  return (
    <div
      className="competition-preview-dialog-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="competition-preview-title"
      onClick={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div className="competition-preview-dialog">
        <div className="competition-preview-dialog__left">
          <div className="competition-preview-dialog__forecast">
            <h3 className="competition-preview-dialog__forecast-title">Prognoza</h3>
            <p className="competition-preview-dialog__forecast-line">
              Jest <span className="competition-preview-dialog__forecast-condition">{getWeatherConditionLabel(weather.condition)}</span>
              <span className="competition-preview-dialog__forecast-icon-inline" aria-hidden>
                <WeatherIcon condition={weather.condition} />
              </span>
              Temperatura wynosi {weather.tempC} °C.
            </p>
            <p className="competition-preview-dialog__forecast-line competition-preview-dialog__forecast-line--wind">
              <WindIcon />
              <WindSpeedWithDirection speed={weather.windMs} />.
            </p>
            <p className="competition-preview-dialog__forecast-line">
              {variabilitySentence(weather.windVariability)}
            </p>
          </div>

          {isDirector && (
            <div className="competition-preview-dialog__manual-bar-card">
              <label className="competition-preview-dialog__manual-bar">
                <input
                  type="checkbox"
                  checked={manualBar}
                  onChange={(e) => setManualBar(e.target.checked)}
                />
                <span>Ustawiaj rozbieg samemu</span>
              </label>
            </div>
          )}
        </div>

        <div className="competition-preview-dialog__right">
          <h2 id="competition-preview-title" className="competition-preview-dialog__title">
            {formatEventShortLabel(event)} — {event.hill}
          </h2>
          <p className="competition-preview-dialog__subtitle">
            Lista startowa · {participating.length} {athleteLabel}
          </p>

          {coachCountry && coachRoster.length > 0 && (
            <div className="competition-preview-dialog__coach-actions">
              <span className="competition-preview-dialog__coach-label">
                Twoi zawodnicy (trening nieobowiązkowy):
              </span>
              <div className="competition-preview-dialog__coach-buttons">
                <button type="button" onClick={selectAllCoach} className="competition-preview-dialog__btn-link">
                  Zaznacz wszystkich
                </button>
                <span aria-hidden>·</span>
                <button type="button" onClick={deselectAllCoach} className="competition-preview-dialog__btn-link">
                  Odznacz wszystkich
                </button>
              </div>
            </div>
          )}

          <div className="competition-preview-dialog__list-wrap">
            <ul className="competition-preview-dialog__list" role="list">
              {fullStartList.map((j, idx) => {
                const key = jumperKey(j);
                const isParticipating = participatingKeys.has(key);
                const isCoachJumper = j.country === coachCountry;
                const canToggle = isCoachJumper;
                return (
                  <li key={key} className="competition-preview-dialog__row">
                    <span className="competition-preview-dialog__pos">{idx + 1}.</span>
                    {canToggle ? (
                      <label className="competition-preview-dialog__checkbox-label">
                        <input
                          type="checkbox"
                          checked={isParticipating}
                          onChange={() => toggleParticipating(j)}
                        />
                        <span className="competition-preview-dialog__flag">{countryToFlag(j.country)}</span>
                        <span>
                          {j.name} {j.surname}
                        </span>
                      </label>
                    ) : (
                      <>
                        <span className="competition-preview-dialog__flag">{countryToFlag(j.country)}</span>
                        <span>
                          {j.name} {j.surname}
                        </span>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="competition-preview-dialog__actions">
            <button
              type="button"
              className="competition-preview-dialog__btn competition-preview-dialog__btn--secondary"
              onClick={onCancel}
            >
              Anuluj
            </button>
            <button
              type="button"
              className="competition-preview-dialog__btn competition-preview-dialog__btn--primary"
              onClick={() => onConfirm({ participating, autoBar: !manualBar })}
            >
              Przejdź do konkursu
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
