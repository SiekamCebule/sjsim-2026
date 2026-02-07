import type { JSX } from 'react';
import { useState, useMemo, useEffect } from 'react';
import type { ScheduleItem, NextEventWeather } from '../data/predazzoSchedule';
import { getWeatherConditionLabel } from '../data/predazzoSchedule';
import { WEATHER_ICONS } from '../data/weatherIcons';
import { buildDuetRound1StartList, buildIndividualStartList, buildMixedRound1StartList, createDefaultRandom, JuryBravery, type SimulationJumper } from '@sjsim/core';
import { type Jumper } from '../data/jumpersData';
import { CountryFlag } from './CountryFlag';
import type { GameDataSnapshot } from '../data/gameDataSnapshot';
import {
  resolveMenTeams,
  resolveWomenTeams,
  resolveMenWorldCupOrder,
  resolveWomenWorldCupOrder,
} from '../data/gameDataSnapshot';
import { JURY_BRAVERY_LABELS, JURY_BRAVERY_OPTIONS, pickJuryBravery } from '../data/juryBravery';
import { getMixedNationsCupRanking, getMenNationsCupRanking } from '../data/nationsCup';
import type { EventResultsSummary } from '../data/eventResults';
import { getSkippedJumperKeys } from '../data/startList';
import { buildTeamPairs } from '../data/teamSelection';
import type { GameConfigState } from './GameConfig';
import './competition-preview-dialog.css';

function formatEventShortLabel(item: ScheduleItem): string {
  const g =
    item.gender === 'men'
      ? 'mężczyzn'
      : item.gender === 'women'
        ? 'kobiet'
        : 'mieszany';
  if (item.type === 'training') return `Trening ${g}`.trim();
  if (item.type === 'trial') return `Seria próbna ${g}`.trim();
  if (item.type === 'individual') return `Konkurs indywidualny ${g}`.trim();
  if (item.type === 'team_mixed') return 'Konkurs drużyn mieszanych';
  return 'Konkurs duetów mężczyzn';
}

function isDuetTrial(event: ScheduleItem): boolean {
  return (
    event.type === 'trial' &&
    event.gender === 'men' &&
    (event.trialKind === 'team_men_pairs' || event.id === '21' || event.label.toLowerCase().includes('duet'))
  );
}

function windSpeedLabel(speed: number): string {
  const abs = Math.abs(speed);
  const dirLabel = speed < 0 ? 'w plecy' : 'pod narty';
  return `${abs.toFixed(1)} m/s ${dirLabel}`;
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

function variabilitySentence(v: number): string {
  if (v <= 0.04) return 'Wiatr będzie bardzo przewidywalny.';
  if (v <= 0.2) return 'Wiatr będzie raczej przewidywalny.';
  if (v <= 0.5) return 'Wiatr będzie umiarkowanie zmienny.';
  if (v <= 0.75) return 'Wiatr będzie trochę "kręcił".';
  if (v <= 1.15) return 'Wiatr będzie mocno zmienny.';
  return 'Wiatr będzie skrajnie loteryjny.';
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
  allowParticipationToggle?: boolean;
  gameData?: GameDataSnapshot | null;
  eventResults?: Record<string, EventResultsSummary>;
  trainingSeriesIndex?: number;
  /** Skład wybrany przez trenera dla team_mixed (np. na serię próbną). */
  teamLineupPreview?: Jumper[];
  onConfirm: (params: {
    participating?: Jumper[];
    autoBar: boolean;
    juryBravery?: JuryBravery;
  }) => void;
  onCancel: () => void;
}

export const CompetitionPreviewDialog = ({
  event,
  config,
  weather,
  allowParticipationToggle = true,
  gameData,
  eventResults,
  trainingSeriesIndex,
  teamLineupPreview,
  onConfirm,
  onCancel,
}: CompetitionPreviewDialogProps): JSX.Element => {
  const isDirector = config?.mode === 'director';
  const coachCountry = config?.mode === 'coach' ? config.selectedCountry ?? '' : '';
  const canToggleParticipation = allowParticipationToggle && !!coachCountry;

  const fullStartList = useMemo(() => {
    const random = createDefaultRandom();
    if (isDuetTrial(event)) {
      const men = resolveMenTeams(gameData);
      const jumperById = new Map(men.map((j) => [jumperId(j), j]));
      const teams = buildTeamPairs(men, undefined, eventResults);
      const duetTeams = teams.map((t) => ({
        teamId: t.id,
        country: t.country,
        jumpers: [t.simMembers[0]!, t.simMembers[1]!] as [SimulationJumper, SimulationJumper],
      }));
      const ranking = getMenNationsCupRanking();
      const startList = buildDuetRound1StartList(duetTeams, ranking);
      return startList.map((entry) => jumperById.get(entry.jumper.id)!).filter(Boolean);
    }
    if (event.gender === 'mixed') {
      const men = resolveMenTeams(gameData);
      const women = resolveWomenTeams(gameData);
      const menByCountry = new Map<string, Jumper[]>();
      const womenByCountry = new Map<string, Jumper[]>();
      men.forEach((j) => {
        const list = menByCountry.get(j.country) ?? [];
        list.push(j);
        menByCountry.set(j.country, list);
      });
      women.forEach((j) => {
        const list = womenByCountry.get(j.country) ?? [];
        list.push(j);
        womenByCountry.set(j.country, list);
      });
      const jumperById = new Map<string, Jumper>();
      [...men, ...women].forEach((j) => jumperById.set(jumperId(j), j));
      const countries = [...menByCountry.keys()].filter((country) => {
        const menList = menByCountry.get(country) ?? [];
        const womenList = womenByCountry.get(country) ?? [];
        return menList.length >= 2 && womenList.length >= 2;
      });
      const teams = countries.map((country) => {
        const menList = menByCountry.get(country)!;
        const womenList = womenByCountry.get(country)!;
        const useCustom =
          teamLineupPreview &&
          teamLineupPreview.length === 4 &&
          coachCountry &&
          country === coachCountry;
        const members = useCustom
          ? (teamLineupPreview as [Jumper, Jumper, Jumper, Jumper])
          : ([womenList[0]!, menList[0]!, womenList[1]!, menList[1]!] as const);
        return {
          teamId: country,
          country,
          jumpers: members.map(toSimulationJumper) as [
            SimulationJumper,
            SimulationJumper,
            SimulationJumper,
            SimulationJumper
          ],
        };
      });
      const ranking = getMixedNationsCupRanking();
      const startList = buildMixedRound1StartList(teams, ranking);
      return startList.map((entry) => jumperById.get(entry.jumper.id)!).filter(Boolean);
    }
    if (event.gender === 'women') {
      const womenRoster = resolveWomenTeams(gameData);
      const simRoster = womenRoster.map(toSimulationJumper);
      const wcOrder = [...resolveWomenWorldCupOrder(gameData)].reverse();
      const startList = buildIndividualStartList(simRoster, wcOrder, random);
      const jumperById = new Map(womenRoster.map((j) => [jumperId(j), j]));
      return startList.map((entry) => jumperById.get(entry.jumper.id)!).filter(Boolean);
    }
    const callups = Object.values(config?.allCallups ?? {}).flat();
    const menRoster = callups.length > 0 ? callups : resolveMenTeams(gameData);
    const simRoster = menRoster.map(toSimulationJumper);
    const wcOrder = [...resolveMenWorldCupOrder(gameData)].reverse();
    const startList = buildIndividualStartList(simRoster, wcOrder, random);
    const jumperById = new Map(menRoster.map((j) => [jumperId(j), j]));
    return startList.map((entry) => jumperById.get(entry.jumper.id)!).filter(Boolean);
  }, [event.gender, event.type, event.trialKind, event.id, event.label, config?.allCallups, gameData, eventResults, coachCountry, teamLineupPreview]);

  const skippedKeys = useMemo(() => {
    if (event.type !== 'training' && event.type !== 'trial') return new Set<string>();
    if (event.gender === 'mixed') return new Set<string>();
    return getSkippedJumperKeys({
      event,
      roster: fullStartList,
      eventResults,
      trainingSeriesIndex,
    });
  }, [event, fullStartList, eventResults, trainingSeriesIndex]);

  /** Lista startowa do wyświetlenia: bez tych, którzy zrezygnowali z treningu/serii próbnej. */
  const startListDisplay = useMemo(() => {
    if (event.type !== 'training' && event.type !== 'trial') return fullStartList;
    return fullStartList.filter((j) => !skippedKeys.has(jumperKey(j)));
  }, [event.type, fullStartList, skippedKeys]);

  /** Dla trenera: którzy z jego kadry są powołani (można odznaczyć w treningu). */
  const coachRoster = useMemo(() => {
    if (!coachCountry) return [];
    return fullStartList.filter((j) => j.country === coachCountry);
  }, [fullStartList, coachCountry]);

  /** Domyślni uczestnicy (bez rezygnujących). */
  const defaultParticipatingKeys = useMemo(() => {
    const s = new Set<string>();
    fullStartList.forEach((j) => {
      if (!skippedKeys.has(jumperKey(j))) s.add(jumperKey(j));
    });
    return s;
  }, [fullStartList, skippedKeys]);

  /** Zaznaczeni do startu — domyślnie wszyscy; trener może odznaczyć swoich. */
  const [participatingKeys, setParticipatingKeys] = useState<Set<string>>(() => defaultParticipatingKeys);
  useEffect(() => {
    setParticipatingKeys(defaultParticipatingKeys);
  }, [event.id, defaultParticipatingKeys]);

  const hasParticipationEdits = useMemo(() => {
    if (defaultParticipatingKeys.size !== participatingKeys.size) return true;
    for (const key of defaultParticipatingKeys) {
      if (!participatingKeys.has(key)) return true;
    }
    return false;
  }, [defaultParticipatingKeys, participatingKeys]);

  /** Zaznaczone = ręcznie ustawiać belkę. Domyślnie auto. */
  const [manualBar, setManualBar] = useState(false);
  const [juryBravery, setJuryBravery] = useState<JuryBravery>(() => pickJuryBravery(event));

  const participating = useMemo(
    () => fullStartList.filter((j) => participatingKeys.has(jumperKey(j))),
    [fullStartList, participatingKeys]
  );

  const resignedList = useMemo(
    () => fullStartList.filter((j) => !participatingKeys.has(jumperKey(j))),
    [fullStartList, participatingKeys]
  );

  const toggleParticipating = (j: Jumper): void => {
    if (!canToggleParticipation) return;
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

  const athleteLabel =
    event.gender === 'mixed'
      ? 'zawodniczek i zawodników'
      : event.gender === 'women'
        ? 'zawodniczek'
        : 'zawodników';
  const showCoachRosterLeft = canToggleParticipation && coachRoster.length > 0;
  const showSkippedList = (event.type === 'training' || event.type === 'trial') && resignedList.length > 0;

  return (
    <div
      className="competition-preview-dialog-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="competition-preview-title"
      onClick={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div className="competition-preview-dialog">
        <div className="competition-preview-dialog__body">
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
                {windSpeedLabel(weather.windMs)}.
              </p>
              <p className="competition-preview-dialog__forecast-line">
                {variabilitySentence(weather.windVariability)}
              </p>
            </div>

            {showCoachRosterLeft && (
              <div className="competition-preview-dialog__coach-roster-card">
                <h3 className="competition-preview-dialog__coach-roster-title">
                  {event.gender === 'women' ? 'Twoje zawodniczki' : 'Twoi zawodnicy'}
                </h3>
                <p className="competition-preview-dialog__coach-roster-hint">
                  Trening nieobowiązkowy — odznacz {event.gender === 'women' ? 'niestartujące' : 'niestartujących'}.
                </p>
                <ul className="competition-preview-dialog__coach-roster-list" role="list">
                  {coachRoster.map((j) => {
                    const key = jumperKey(j);
                    const isParticipating = participatingKeys.has(key);
                    return (
                      <li key={key}>
                        <label className="competition-preview-dialog__coach-roster-row">
                          <input
                            type="checkbox"
                            checked={isParticipating}
                            onChange={() => toggleParticipating(j)}
                          />
                          <span className="competition-preview-dialog__flag"><CountryFlag country={j.country} /></span>
                          <span>{j.name} {j.surname}</span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

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
                <label className={`competition-preview-dialog__jury-select ${manualBar ? 'competition-preview-dialog__jury-select--disabled' : ''}`}>
                  <span>Odwaga jury</span>
                  <select
                    value={juryBravery}
                    onChange={(e) => setJuryBravery(e.target.value as JuryBravery)}
                    disabled={manualBar}
                  >
                    {JURY_BRAVERY_OPTIONS.map((value) => (
                      <option key={value} value={value}>
                        {JURY_BRAVERY_LABELS[value]}
                      </option>
                    ))}
                  </select>
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
            {showSkippedList && (
              <div className="competition-preview-dialog__skip-list">
                <span className="competition-preview-dialog__skip-label">Zrezygnowali:</span>
                <div className="competition-preview-dialog__skip-items">
                  {resignedList.map((j) => (
                    <span key={jumperKey(j)} className="competition-preview-dialog__skip-item">
                      <CountryFlag country={j.country} /> {j.name} {j.surname}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="competition-preview-dialog__list-wrap">
              <ul className="competition-preview-dialog__list" role="list">
                {startListDisplay.map((j, idx) => {
                  const key = jumperKey(j);
                  const isParticipating = participatingKeys.has(key);
                  const isCoachJumper = j.country === coachCountry;
                  const canToggle = canToggleParticipation && isCoachJumper;
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
                          <span className="competition-preview-dialog__flag"><CountryFlag country={j.country} /></span>
                          <span>
                            {j.name} {j.surname}
                          </span>
                        </label>
                      ) : (
                        <>
                          <span className="competition-preview-dialog__flag"><CountryFlag country={j.country} /></span>
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
          </div>
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
            onClick={() =>
              onConfirm({
                participating:
                  event.type === 'trial' && event.gender === 'mixed' && !hasParticipationEdits
                    ? undefined
                    : participating,
                autoBar: !manualBar,
                juryBravery: manualBar ? undefined : juryBravery,
              })}
          >
            Przejdź do konkursu
          </button>
        </div>
      </div>
    </div>
  );
};
