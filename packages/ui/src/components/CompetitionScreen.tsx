import type { JSX, MouseEvent } from 'react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  SimpleJumpSimulator,
  buildDuetRound1StartList,
  buildIndividualRoundNStartList,
  buildIndividualStartList,
  buildMixedRound1StartList,
  createDefaultRandom,
  getDuetGroupStartList,
  getMixedGroupStartList,
  scoring,
  selectStartingGate,
  windEngine,
  HILL_PARAMS,
  JuryBravery,
  type HillScoringParams,
  type IndividualStanding,
  type JumpResult as CoreJumpResult,
  type SimulationJumper,
  type StartListEntry,
  type TeamStanding,
  type Wind,
} from '@sjsim/core';
import type { ScheduleItem, NextEventWeather } from '../data/predazzoSchedule';
import type { EventResultsSummary } from '../data/eventResults';
import {
  countryCodeToName,
  countryToFlag,
  type Jumper,
} from '../data/jumpersData';
import type { GameDataSnapshot } from '../data/gameDataSnapshot';
import {
  resolveMenTeams,
  resolveWomenTeams,
  resolveMenWorldCupOrder,
  resolveWomenWorldCupOrder,
} from '../data/gameDataSnapshot';
import type { ArchiveEntry, ArchiveJumpResult, PredazzoArchiveEntry } from '../data/archiveTypes';
import { formatPredazzoArchiveLabel } from '../data/archiveUtils';
import { JURY_BRAVERY_LABELS, JURY_BRAVERY_OPTIONS, pickJuryBravery } from '../data/juryBravery';
import { getMixedNationsCupRanking, getMenNationsCupRanking } from '../data/nationsCup';
import { buildMixedTeams, buildTeamPairs, type TeamEntry } from '../data/teamSelection';
import type { GameConfigState } from './GameConfig';
import './competition-screen.css';

type RoundKind = 'training' | 'trial' | 'individual' | 'team_mixed' | 'team_men_pairs';

interface CompetitionScreenProps {
  event: ScheduleItem;
  config: GameConfigState | null;
  participating?: Jumper[];
  teamLineups?: Record<string, Jumper[]>;
  autoBar?: boolean;
  juryBravery?: JuryBravery;
  autoJumpIntervalMs?: number;
  weather?: NextEventWeather;
  eventResults?: Record<string, EventResultsSummary>;
  trainingSeriesIndex?: number;
  gameData?: GameDataSnapshot | null;
  onExit: (params?: { aborted?: boolean; summary?: EventResultsSummary; archive?: ArchiveEntry }) => void;
}

interface JumpQueueItem {
  id: string;
  roundIndex: number;
  bib: number;
  jumper: Jumper;
  teamId?: string;
  slotInTeam?: number;
}

interface JumpResult {
  id: string;
  roundIndex: number;
  bib: number;
  jumper: Jumper;
  teamId?: string;
  slotInTeam?: number;
  gate: number;
  gateDelta: number;
  gateDeltaJury: number;
  gateDeltaCoach: number;
  gateCompensationDelta: number;
  wind: Wind;
  result: CoreJumpResult;
  styleNotes: number[] | null;
}

const SIMULATOR_CONFIG = {
  skillImpactFactor: 1.5,
  averageBigSkill: 7,
  takeoffRatingPointsByForm: 1.5,
  flightRatingPointsByForm: 1.8,
  randomAdditionsRatio: 0.9,
  distanceSpreadByRatingFactor: 1.2,
  hsFlatteningStartRatio: 0.07,
  hsFlatteningStrength: 1.0,
};

/** Zakres delty belki względem startowej: od -GATE_DELTA_RANGE do +GATE_DELTA_RANGE (ręczna i auto). */
const GATE_DELTA_RANGE = 12;

const BRAVERY_RISK_FACTOR: Record<JuryBravery, number> = {
  [JuryBravery.VeryLow]: 0.7,
  [JuryBravery.Low]: 0.85,
  [JuryBravery.Medium]: 1.0,
  [JuryBravery.High]: 1.15,
  [JuryBravery.VeryHigh]: 1.3,
};

const BRAVERY_OVERSHOOT_TARGET: Record<JuryBravery, number> = {
  [JuryBravery.VeryLow]: 0.015,
  [JuryBravery.Low]: 0.03,
  [JuryBravery.Medium]: 0.09,
  [JuryBravery.High]: 0.25,
  [JuryBravery.VeryHigh]: 0.4,
};

const MIXED_WOMEN_GATE_OFFSET = 2;
const SELECTION_K_POINT = 128;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function smoothStep(edge0: number, edge1: number, x: number): number {
  if (edge1 <= edge0) return x < edge0 ? 0 : 1;
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function effectiveSkill(jumper: Jumper, kPoint: number): number {
  const small = jumper.aSkill ?? 5;
  const big = jumper.bSkill ?? 5;
  const t = smoothStep(95, 125, kPoint);
  return lerp(small, big, t);
}

function jumperQuality(jumper: Jumper, kPoint: number): number {
  const form = jumper.form ?? 5;
  return (effectiveSkill(jumper, kPoint) + form) / 2;
}

function distanceScore(distance: number, kPoint: number, realHs: number): number {
  const hsRange = Math.max(1, realHs - kPoint);
  const base = (distance - kPoint) / hsRange;
  const overshoot = Math.max(0, distance - realHs) / hsRange;
  return clamp(base + overshoot * 0.6, -1.6, 1.6);
}

function roundKindFromEvent(event: ScheduleItem): RoundKind {
  if (event.type === 'trial' && event.trialKind === 'team_men_pairs') return 'team_men_pairs';
  if (event.type === 'trial' && event.trialKind === 'team_mixed') return 'team_mixed';
  if (event.type === 'trial' && event.gender === 'mixed') return 'team_mixed';
  if (
    event.type === 'trial' &&
    event.gender === 'men' &&
    (event.id === '21' || event.label.toLowerCase().includes('duet'))
  ) {
    return 'team_men_pairs';
  }
  return event.type;
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

function roundDistance(distance: number): number {
  return Math.round(distance * 2) / 2;
}

/** Noty za styl: zawsze z jedną cyfrą po przecinku (np. 18.0, 18.5). */
function formatStylePoints(value: number): string {
  return value.toFixed(1);
}

function formatStyleNotes(notes: number[] | null): string {
  if (!notes || notes.length === 0) return '—';
  return notes.map((note) => formatStylePoints(note)).join(' | ');
}

type StyleNotesResult = { notes: number[]; sum: number };

function ensureStyleNoteRange(x: number): number {
  return Math.max(1, Math.min(20, x));
}

function roundToHalf(x: number): number {
  return Math.round(x * 2) / 2;
}

function normalizeStyleNote(x: number): number {
  return roundToHalf(ensureStyleNoteRange(x));
}

function judgeNoteBaseRandom(
  landing: Parameters<typeof scoring.stylePoints>[0]['landing'],
  random: Parameters<typeof scoring.stylePoints>[0]['random']
): number {
  switch (landing) {
    case 'telemark':
      return random.uniform(-0.7, 0.7);
    case 'parallel':
      return random.uniform(-3, -2);
    case 'touchDown':
      return random.uniform(-9, 7);
    case 'fall':
      return random.uniform(-11.5, -8.5);
    default:
      return random.uniform(-9, 7);
  }
}

function judgeNoteSpecificRandom(
  landing: Parameters<typeof scoring.stylePoints>[0]['landing'],
  random: Parameters<typeof scoring.stylePoints>[0]['random']
): number {
  switch (landing) {
    case 'telemark':
      return random.uniform(-0.7, 0.7);
    case 'parallel':
      return random.uniform(-1.5, 1.5);
    case 'touchDown':
      return random.uniform(-2.4, 2.4);
    case 'fall':
      return random.uniform(-2, 2);
    default:
      return random.uniform(-2.4, 2.4);
  }
}

function judgeNoteDistanceBonus(distance: number, kPoint: number, realHs: number): number {
  const distanceClampedToHs = Math.min(distance, realHs * 1.01);
  const kMultiplier = 0.25;
  return (distanceClampedToHs - kPoint) / (kPoint * kMultiplier);
}

/** Fallback, gdy core nie udostępnia styleNotes: logika 1:1 z core. */
function styleNotesFallback(ctx: Parameters<typeof scoring.stylePoints>[0]): StyleNotesResult {
  const { landing, distance, realHs, kPoint, landingTendency, random } = ctx;
  const noteAdditionByOneLandingSkill = 0.3;
  let baseNote = 17.5 + (landingTendency - 0) * noteAdditionByOneLandingSkill;
  baseNote = ensureStyleNoteRange(baseNote);
  baseNote = ensureStyleNoteRange(baseNote + judgeNoteDistanceBonus(distance, kPoint, realHs));
  baseNote = ensureStyleNoteRange(baseNote + judgeNoteBaseRandom(landing, random));

  const notes = Array.from({ length: 5 }, () =>
    normalizeStyleNote(baseNote + judgeNoteSpecificRandom(landing, random))
  );
  const sorted = [...notes].sort((a, b) => a - b);
  const sumMiddle = sorted[1]! + sorted[2]! + sorted[3]!;
  const roundedSum = roundToHalf(sumMiddle);
  return { notes, sum: Math.max(0, Math.min(60, roundedSum)) };
}

function hillData(hill: ScheduleItem['hill']): { kPoint: number; realHs: number; metersByGate: number; scoring: HillScoringParams } {
  const scoring = hill === 'HS107' ? HILL_PARAMS['predazzo-hs107'] : HILL_PARAMS['predazzo-hs141'];
  const kPoint = hill === 'HS107' ? 98 : 128;
  const realHs = hill === 'HS107' ? 107 : 141;
  const metersByGate = scoring.pointsPerGate / scoring.pointsPerMeter;
  return { kPoint, realHs, metersByGate, scoring };
}

function windBaseFromWeather(weather?: NextEventWeather): Wind {
  if (!weather) return { average: 0, instability: 0.3 };
  return { average: weather.windMs, instability: weather.windVariability };
}

function roundLabel(event: ScheduleItem, roundIndex: number): string {
  if (event.type === 'training') return 'Training round';
  if (event.type === 'trial') return 'Trial round';
  if (event.type === 'individual') return `Individual ${roundIndex + 1}st round`;
  if (event.type === 'team_men_pairs') return `Super Team ${roundIndex + 1}st round`;
  return `Mixed Team ${roundIndex + 1}st round`;
}

function teamLabel(team: TeamEntry): string {
  return `${countryCodeToName(team.country)}`;
}

function NextRoundGateHint({
  gate,
  menGate,
  womenGate,
}: {
  gate?: number;
  menGate?: number;
  womenGate?: number;
}): JSX.Element {
  const label =
    menGate != null && womenGate != null
      ? `Belka M: ${menGate} · K: ${womenGate}`
      : `Belka ${gate ?? '-'}`;
  return <span className="competition-screen__gate-hint">{label}</span>;
}

function buildIndividualStandings(
  results: JumpResult[],
  bibById: Map<string, number>,
  jumperById: Map<string, Jumper>,
  roundIndex: number
): IndividualStanding[] {
  const totals = new Map<string, { total: number; jumpResults: CoreJumpResult[] }>();
  results
    .filter((r) => r.roundIndex <= roundIndex)
    .forEach((r) => {
      const id = jumperId(r.jumper);
      const existing = totals.get(id);
      if (existing) {
        existing.total += r.result.points;
        existing.jumpResults.push(r.result);
      } else {
        totals.set(id, { total: r.result.points, jumpResults: [r.result] });
      }
    });
  const standings: IndividualStanding[] = [];
  totals.forEach((value, id) => {
    const jumper = jumperById.get(id);
    if (!jumper) return;
    standings.push({
      bib: bibById.get(id) ?? 0,
      jumperId: id,
      country: jumper.country,
      totalPoints: value.total,
      jumpResults: value.jumpResults,
    });
  });
  return standings;
}

function buildTeamStandings(
  results: JumpResult[],
  teams: TeamEntry[],
  roundIndex: number
): TeamStanding[] {
  return teams.map((team) => {
    const teamResults = results
      .filter((r) => r.teamId === team.id && r.roundIndex <= roundIndex)
      .map((r) => r.result);
    const totalPoints = teamResults.reduce((acc, r) => acc + r.points, 0);
    const jumpResultsBySlot: CoreJumpResult[][] = team.simMembers.map((_, slot) =>
      results
        .filter((r) => r.teamId === team.id && r.slotInTeam === slot && r.roundIndex <= roundIndex)
        .map((r) => r.result)
    );
    return {
      teamId: team.id,
      country: team.country,
      totalPoints,
      jumpResultsBySlot,
    };
  });
}

function findTeamPosition(standings: TeamStanding[], teamId?: string): number | null {
  if (!teamId) return null;
  const pos = standings.findIndex((s) => s.teamId === teamId);
  return pos >= 0 ? pos + 1 : null;
}

function findJumperPosition(standings: IndividualStanding[], jumper: Jumper): number | null {
  const id = jumperId(jumper);
  const pos = standings.findIndex((s) => s.jumperId === id);
  return pos >= 0 ? pos + 1 : null;
}

export const CompetitionScreen = ({
  event,
  config,
  participating,
  teamLineups,
  autoBar = true,
  juryBravery: initialJuryBravery,
  autoJumpIntervalMs = 5000,
  weather,
  eventResults,
  trainingSeriesIndex,
  gameData,
  onExit,
}: CompetitionScreenProps): JSX.Element => {
  const kind = roundKindFromEvent(event);
  const isDirector = config?.mode === 'director';
  const isCoach = config?.mode === 'coach';
  const coachCountry = isCoach ? config?.selectedCountry ?? '' : '';
  const includeStyle = event.type !== 'training' && event.type !== 'trial';

  const random = useMemo(() => createDefaultRandom(), [event.id]);
  const simulator = useMemo(() => new SimpleJumpSimulator(SIMULATOR_CONFIG, random), [random]);
  const gateRandom = useMemo(() => createDefaultRandom(), [event.id]);
  const gateSimulator = useMemo(() => new SimpleJumpSimulator(SIMULATOR_CONFIG, gateRandom), [gateRandom]);
  const baseWind = useMemo(() => windBaseFromWeather(weather), [weather]);
  const windProvider = useMemo(
    () => windEngine({ baseAverage: baseWind.average, windVariability: baseWind.instability }, random),
    [baseWind.average, baseWind.instability, random]
  );
  const hill = useMemo(() => hillData(event.hill), [event.hill]);
  const isMixedEvent = kind === 'team_mixed';
  const [juryBravery, setJuryBravery] = useState<JuryBravery>(() => initialJuryBravery ?? pickJuryBravery(event));
  const [showJuryBraveryDialog, setShowJuryBraveryDialog] = useState(
    () => isDirector && autoBar && !initialJuryBravery
  );

  useEffect(() => {
    setJuryBravery(initialJuryBravery ?? pickJuryBravery(event));
    setShowJuryBraveryDialog(isDirector && autoBar && !initialJuryBravery);
  }, [event.id, initialJuryBravery, isDirector, autoBar]);

  const menTeams = useMemo(() => resolveMenTeams(gameData), [gameData]);
  const womenTeams = useMemo(() => resolveWomenTeams(gameData), [gameData]);

  const individualRoster = useMemo(() => {
    if (participating && participating.length > 0) return participating;
    if (event.gender === 'women') return womenTeams;
    if (event.gender === 'men') {
      const callups = Object.values(config?.allCallups ?? {}).flat();
      return callups.length > 0 ? callups : menTeams;
    }
    return [];
  }, [event.gender, participating, config?.allCallups, menTeams, womenTeams]);

  const teamPairs = useMemo(
    () => (kind === 'team_men_pairs' ? buildTeamPairs(menTeams, teamLineups, eventResults) : []),
    [kind, menTeams, teamLineups, eventResults]
  );
  const allowedMixedIds = useMemo(() => {
    if (event.type !== 'trial' || event.gender !== 'mixed' || !participating || participating.length === 0) return null;
    return new Set(participating.map((j) => jumperId(j)));
  }, [event.type, event.gender, participating]);
  const teamMixed = useMemo(
    () => (kind === 'team_mixed' ? buildMixedTeams(menTeams, womenTeams, teamLineups, eventResults, allowedMixedIds ?? undefined) : []),
    [kind, menTeams, womenTeams, teamLineups, eventResults, allowedMixedIds]
  );

  const totalRounds = event.type === 'individual' ? 2 : event.type === 'team_men_pairs' ? 3 : event.type === 'team_mixed' ? 2 : 1;

  const allSimJumpers = useMemo(() => {
    if (kind === 'team_men_pairs') return teamPairs.flatMap((t) => t.simMembers);
    if (kind === 'team_mixed') return teamMixed.flatMap((t) => t.simMembers);
    return individualRoster.map(toSimulationJumper);
  }, [kind, teamPairs, teamMixed, individualRoster]);

  const computeStartGateByGender = (jumpers: SimulationJumper[]): { men: number; women: number } => {
    const baseHill = { simulationData: { kPoint: hill.kPoint, realHs: hill.realHs, metersByGate: hill.metersByGate } };
    const safeSelect = (jumpers: SimulationJumper[]): number => {
      if (jumpers.length === 0) return 15;
      try {
        return selectStartingGate({
          simulator,
          windProvider,
          juryBravery,
          jumpers,
          hill: baseHill,
        });
      } catch {
        return 15;
      }
    };
    if (!isMixedEvent) {
      const startGate = safeSelect(jumpers) + 1;
      return { men: startGate, women: startGate };
    }
    const menJumpers = jumpers.filter((j) => !j.isWomen);
    const womenJumpers = jumpers.filter((j) => j.isWomen);
    const menStart = safeSelect(menJumpers) + 1;
    const womenStart = safeSelect(womenJumpers) + 1 + MIXED_WOMEN_GATE_OFFSET;
    return {
      men: menStart,
      women: womenStart,
    };
  };

  const [startGateByGender, setStartGateByGender] = useState(() => computeStartGateByGender(allSimJumpers));

  useEffect(() => {
    console.log('[SJSIM][AUTO-GATE][START]', {
      eventId: event.id,
      kind: event.type,
      juryBravery,
      startGateByGender,
      isMixedEvent,
    });
  }, [event.id, event.type, juryBravery, startGateByGender, isMixedEvent]);

  const [roundIndex, setRoundIndex] = useState(0);
  const [queueIndex, setQueueIndex] = useState(0);
  const [queue, setQueue] = useState<JumpQueueItem[]>([]);
  const [results, setResults] = useState<JumpResult[]>([]);
  const [lastJumpId, setLastJumpId] = useState<string | null>(null);
  const [gateDeltaMen, setGateDeltaMen] = useState(0);
  const [gateDeltaWomen, setGateDeltaWomen] = useState(0);
  const [coachGateDelta, setCoachGateDelta] = useState(0);
  const [lastGateChangeJump, setLastGateChangeJump] = useState({ men: -999, women: -999 });
  const [gateHighlight, setGateHighlight] = useState(false);
  const [manualGate, setManualGate] = useState(!autoBar);
  const [showManualGateDialog, setShowManualGateDialog] = useState(false);
  const [autoJump, setAutoJump] = useState(false);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [pendingWind, setPendingWind] = useState<Wind>(() => windProvider.getWind());
  const [showExitDialog, setShowExitDialog] = useState(false);
  const [showAutoSimConfirm, setShowAutoSimConfirm] = useState(false);
  const [tooltip, setTooltip] = useState<{ id: string; x: number; y: number } | null>(null);

  const listRef = useRef<HTMLUListElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);

  const canAutoGate = !manualGate;

  const hasTeams = kind === 'team_mixed' || kind === 'team_men_pairs';
  const teams = kind === 'team_men_pairs' ? teamPairs : teamMixed;
  const currentItem = queue[queueIndex];

  const startGateForJumper = (jumper?: Jumper): number => {
    if (!isMixedEvent) return startGateByGender.men;
    if (jumper?.gender === 'women') return startGateByGender.women;
    return startGateByGender.men;
  };

  const gateDeltaForJumper = (jumper?: Jumper): number => {
    if (!isMixedEvent) return gateDeltaMen;
    if (jumper?.gender === 'women') return gateDeltaWomen;
    return gateDeltaMen;
  };

  const currentGateDelta = currentItem ? gateDeltaForJumper(currentItem.jumper) : gateDeltaMen;
  const currentStartGate = currentItem ? startGateForJumper(currentItem.jumper) : startGateByGender.men;
  const minCoachGateDelta = -GATE_DELTA_RANGE - currentGateDelta;
  const gateValueFor = (genderKey: 'men' | 'women', gateDelta: number): number => {
    const startGate = genderKey === 'women' ? startGateByGender.women : startGateByGender.men;
    return startGate + gateDelta;
  };

  useEffect(() => {
    setCoachGateDelta(0);
  }, [currentItem?.id]);


  const jumperById = useMemo(
    () => new Map(individualRoster.map((j) => [jumperId(j), j])),
    [individualRoster]
  );
  const simRoster = useMemo(
    () => individualRoster.map(toSimulationJumper),
    [individualRoster]
  );
  const worldCupOrder = useMemo(
    () =>
      event.gender === 'men'
        ? [...resolveMenWorldCupOrder(gameData)].reverse()
        : event.gender === 'women'
          ? [...resolveWomenWorldCupOrder(gameData)].reverse()
          : [],
    [event.gender, gameData]
  );
  const initialStartList = useMemo(
    () => buildIndividualStartList(simRoster, worldCupOrder, random),
    [simRoster, worldCupOrder, random]
  );
  const bibById = useMemo(
    () => new Map(initialStartList.map((e) => [e.jumper.id, e.bib])),
    [initialStartList]
  );

  const duetTeams = useMemo(
    () =>
      teamPairs.map((t) => ({
        teamId: t.id,
        country: t.country,
        jumpers: [t.simMembers[0]!, t.simMembers[1]!] as [SimulationJumper, SimulationJumper],
      })),
    [teamPairs]
  );
  const mixedTeams = useMemo(
    () =>
      teamMixed.map((t) => ({
        teamId: t.id,
        country: t.country,
        jumpers: [
          t.simMembers[0]!,
          t.simMembers[1]!,
          t.simMembers[2]!,
          t.simMembers[3]!,
        ] as [SimulationJumper, SimulationJumper, SimulationJumper, SimulationJumper],
      })),
    [teamMixed]
  );
  const teamRanking = useMemo(() => {
    if (kind === 'team_men_pairs') return getMenNationsCupRanking();
    if (kind === 'team_mixed') return getMixedNationsCupRanking();
    return new Map<string, number>();
  }, [kind]);

  const buildQueueForRound = (nextRound: number): JumpQueueItem[] => {
    if (kind === 'training' || kind === 'trial' || kind === 'individual') {
      if (nextRound === 0) {
        return initialStartList.map((entry) => ({
          id: `${nextRound}:${entry.jumper.id}`,
          roundIndex: nextRound,
          bib: entry.bib,
          jumper: jumperById.get(entry.jumper.id)!,
        }));
      }
      const standings = buildIndividualStandings(results, bibById, jumperById, nextRound - 1)
        .sort((a, b) => b.totalPoints - a.totalPoints)
        .slice(0, 30);
      const nextList = buildIndividualRoundNStartList(standings, new Map(simRoster.map((j) => [j.id, j])));
      return nextList.map((entry) => ({
        id: `${nextRound}:${entry.jumper.id}`,
        roundIndex: nextRound,
        bib: entry.bib,
        jumper: jumperById.get(entry.jumper.id)!,
      }));
    }
    if (kind === 'team_men_pairs') {
      if (nextRound === 0) {
        const list = buildDuetRound1StartList(duetTeams, teamRanking);
        return list.map((entry) => ({
          id: `${nextRound}:${entry.teamId}:${entry.slotInTeam}`,
          roundIndex: nextRound,
          bib: entry.bib,
          jumper: jumperById.get(entry.jumper.id) ?? teams.find((t) => t.id === entry.teamId)?.members[entry.slotInTeam ?? 0]!,
          teamId: entry.teamId,
          slotInTeam: entry.slotInTeam,
        }));
      }
      const standings = buildTeamStandings(results, teams, nextRound - 1)
        .sort((a, b) => b.totalPoints - a.totalPoints);
      const advancing = nextRound === 1 ? standings.slice(0, 12) : standings.slice(0, 8);
      const advancingTeams = teams.filter((t) => advancing.some((s) => s.teamId === t.id));
      const group0 = getDuetGroupStartList(
        duetTeams.filter((t) => advancingTeams.some((a) => a.id === t.teamId)),
        advancing,
        0
      );
      const group1 = getDuetGroupStartList(
        duetTeams.filter((t) => advancingTeams.some((a) => a.id === t.teamId)),
        advancing,
        1
      );
      return [...group0, ...group1].map((entry) => ({
        id: `${nextRound}:${entry.teamId}:${entry.slotInTeam}`,
        roundIndex: nextRound,
        bib: entry.bib,
        jumper: jumperById.get(entry.jumper.id) ?? teams.find((t) => t.id === entry.teamId)?.members[entry.slotInTeam ?? 0]!,
        teamId: entry.teamId,
        slotInTeam: entry.slotInTeam,
      }));
    }
    if (nextRound === 0) {
      const list = buildMixedRound1StartList(mixedTeams, teamRanking);
      return list.map((entry) => ({
        id: `${nextRound}:${entry.teamId}:${entry.slotInTeam}`,
        roundIndex: nextRound,
        bib: entry.bib,
        jumper: jumperById.get(entry.jumper.id) ?? teams.find((t) => t.id === entry.teamId)?.members[entry.slotInTeam ?? 0]!,
        teamId: entry.teamId,
        slotInTeam: entry.slotInTeam,
      }));
    }
    const standings = buildTeamStandings(results, teams, nextRound - 1)
      .sort((a, b) => b.totalPoints - a.totalPoints);
    const advancing = standings.slice(0, 8);
    const advancingTeams = teams.filter((t) => advancing.some((s) => s.teamId === t.id));
    const advancingMixed = mixedTeams.filter((t) => advancingTeams.some((a) => a.id === t.teamId));
    const groupList: StartListEntry[] = [];
    for (let slot = 0; slot < 4; slot++) {
      groupList.push(
        ...getMixedGroupStartList(
          advancingMixed,
          advancing,
          slot
        )
      );
    }
    return groupList.map((entry) => ({
      id: `${nextRound}:${entry.teamId}:${entry.slotInTeam}`,
      roundIndex: nextRound,
      bib: entry.bib,
      jumper: jumperById.get(entry.jumper.id) ?? teams.find((t) => t.id === entry.teamId)?.members[entry.slotInTeam ?? 0]!,
      teamId: entry.teamId,
      slotInTeam: entry.slotInTeam,
    }));
  };

  const reorderQueueForNextGroup = (params: {
    sourceQueue: JumpQueueItem[];
    nextQueueIndex: number;
    nextResults: JumpResult[];
    currentItem: JumpQueueItem;
  }): JumpQueueItem[] | null => {
    const { sourceQueue, nextQueueIndex, nextResults, currentItem } = params;
    if (!hasTeams || roundIndex === 0) return null;
    if (!currentItem.teamId || currentItem.slotInTeam == null) return null;
    if (nextQueueIndex >= sourceQueue.length) return null;
    const nextItem = sourceQueue[nextQueueIndex];
    if (!nextItem || nextItem.slotInTeam == null) return null;
    if (nextItem.slotInTeam === currentItem.slotInTeam) return null;

    const teamIds = new Set(
      sourceQueue.map((item) => item.teamId).filter((id): id is string => Boolean(id))
    );
    if (teamIds.size === 0) return null;
    const roundTeams = teams.filter((t) => teamIds.has(t.id));
    const standings = buildTeamStandings(nextResults, roundTeams, roundIndex);
    const nextSlot = nextItem.slotInTeam;

    const nextGroup =
      kind === 'team_men_pairs'
        ? getDuetGroupStartList(
          duetTeams.filter((t) => teamIds.has(t.teamId)),
          standings,
          nextSlot
        )
        : getMixedGroupStartList(
          mixedTeams.filter((t) => teamIds.has(t.teamId)),
          standings,
          nextSlot
        );

    if (nextGroup.length === 0) return null;
    const groupSize = nextGroup.length;
    const existingGroup = sourceQueue.slice(nextQueueIndex, nextQueueIndex + groupSize);
    if (existingGroup.length !== groupSize || existingGroup.some((item) => item.slotInTeam !== nextSlot)) {
      return null;
    }

    const remapped = nextGroup.map((entry) => ({
      id: `${roundIndex}:${entry.teamId}:${entry.slotInTeam}`,
      roundIndex,
      bib: entry.bib,
      jumper: jumperById.get(entry.jumper.id) ?? teams.find((t) => t.id === entry.teamId)?.members[entry.slotInTeam ?? 0]!,
      teamId: entry.teamId,
      slotInTeam: entry.slotInTeam,
    }));

    return [
      ...sourceQueue.slice(0, nextQueueIndex),
      ...remapped,
      ...sourceQueue.slice(nextQueueIndex + groupSize),
    ];
  };

  useEffect(() => {
    const newQueue = buildQueueForRound(roundIndex);
    setQueue(newQueue);
    setQueueIndex(0);
    setPendingWind(windProvider.getWind());
    if (roundIndex === 0) {
      setStartGateByGender(computeStartGateByGender(allSimJumpers));
    } else {
      const roundJumpers = newQueue.map((entry) => toSimulationJumper(entry.jumper));
      setStartGateByGender(computeStartGateByGender(roundJumpers));
    }
    setGateDeltaMen(0);
    setGateDeltaWomen(0);
    setLastGateChangeJump({ men: -999, women: -999 });
  }, [roundIndex, windProvider, allSimJumpers]);

  useEffect(() => {
    if (!currentItem || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-jump-id="${currentItem.id}"]`);
    if (el instanceof HTMLElement) {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [currentItem]);

  useEffect(() => {
    if (!autoJump) return;
    const t = setTimeout(() => {
      handleNextJump();
    }, autoJumpIntervalMs);
    return () => clearTimeout(t);
  }, [autoJump, autoJumpIntervalMs, queueIndex, roundIndex, gateDeltaMen, gateDeltaWomen, pendingWind]);

  useLayoutEffect(() => {
    if (!tooltip || !tooltipRef.current) return;
    const rect = tooltipRef.current.getBoundingClientRect();
    const padding = 12;
    let nextX = tooltip.x;
    let nextY = tooltip.y;
    if (nextX + rect.width > window.innerWidth - padding) {
      nextX = Math.max(padding, window.innerWidth - rect.width - padding);
    }
    if (nextY + rect.height > window.innerHeight - padding) {
      nextY = Math.max(padding, window.innerHeight - rect.height - padding);
    }
    if (nextX !== tooltip.x || nextY !== tooltip.y) {
      setTooltip((prev) => (prev ? { ...prev, x: nextX, y: nextY } : prev));
    }
  }, [tooltip]);

  const totalJumpsInRound = queue.length;
  const isRoundComplete = queueIndex >= totalJumpsInRound;
  const isEventComplete = isRoundComplete && roundIndex >= totalRounds - 1;
  const completedJumpsInRound = results.filter((r) => r.roundIndex === roundIndex).length;
  const canCoachLowerGate = Boolean(
    isCoach &&
    coachCountry &&
    currentItem &&
    currentItem.jumper.country === coachCountry &&
    !isEventComplete
  );
  const canLowerCoachGate = canCoachLowerGate && coachGateDelta > minCoachGateDelta;
  const canUndoCoachGate = canCoachLowerGate && coachGateDelta < 0;

  const adjustCoachGate = (delta: number): void => {
    if (!canCoachLowerGate) return;
    if (delta >= 0) return;
    setCoachGateDelta((prev) => {
      const next = Math.min(0, prev + delta);
      return Math.max(minCoachGateDelta, next);
    });
  };

  const undoCoachGate = (): void => {
    if (!canUndoCoachGate) return;
    setCoachGateDelta((prev) => Math.min(0, prev + 1));
  };

  useEffect(() => {
    if (isEventComplete) setAutoJump(false);
  }, [isEventComplete]);

  const avgWind = pendingWind.average;

  const avgStylePoints = useMemo(() => {
    const last = results
      .map((r) => r.result.stylePoints)
      .filter((v): v is number => typeof v === 'number')
      .slice(-5);
    if (last.length === 0) return 0;
    return last.reduce((acc, v) => acc + v, 0) / last.length;
  }, [results]);

  const currentTeamStandings = useMemo(
    () => buildTeamStandings(results, teams, roundIndex),
    [results, teams, roundIndex]
  );
  const currentIndividualStandings = useMemo(
    () => buildIndividualStandings(results, bibById, jumperById, roundIndex),
    [results, bibById, jumperById, roundIndex]
  );

  const leaderTotal = useMemo(() => {
    if (hasTeams) {
      return [...currentTeamStandings].sort((a, b) => b.totalPoints - a.totalPoints)[0]?.totalPoints ?? 0;
    }
    return [...currentIndividualStandings].sort((a, b) => b.totalPoints - a.totalPoints)[0]?.totalPoints ?? 0;
  }, [hasTeams, currentTeamStandings, currentIndividualStandings]);

  const currentTotalBefore = useMemo(() => {
    if (!currentItem) return 0;
    if (hasTeams && currentItem.teamId) {
      return currentTeamStandings.find((s) => s.teamId === currentItem.teamId)?.totalPoints ?? 0;
    }
    const id = jumperId(currentItem.jumper);
    return currentIndividualStandings.find((s) => s.jumperId === id)?.totalPoints ?? 0;
  }, [currentItem, hasTeams, currentTeamStandings, currentIndividualStandings]);

  /** W konkursie indywidualnym w 2. serii: miejsce po 1. serii dla następnego zawodnika. */
  const nextJumperPositionAfterRound1 = useMemo(() => {
    if (kind !== 'individual' || roundIndex < 1 || !currentItem) return null;
    const afterRound0 = buildIndividualStandings(results, bibById, jumperById, 0);
    const sorted = [...afterRound0].sort((a, b) => b.totalPoints - a.totalPoints);
    const id = jumperId(currentItem.jumper);
    const idx = sorted.findIndex((s) => s.jumperId === id);
    return idx >= 0 ? idx + 1 : null;
  }, [kind, roundIndex, currentItem, results, bibById, jumperById]);

  const windCompPoints = (wind: Wind): number => {
    // Wiatr z przodu (avg > 0) ma ODEJMOWAĆ punkty, wiatr w plecy (avg < 0) ma DODAWAĆ.
    if (wind.average >= 0) return -wind.average * hill.scoring.windHeadwindPerMs;
    return Math.abs(wind.average) * hill.scoring.windTailwindPerMs;
  };

  const valColorClass = (v: number, prefix: 'wind' | 'comp'): string =>
    `competition-screen__val competition-screen__val--${prefix}-${v > 0 ? 'pos' : v < 0 ? 'neg' : 'zero'}`;

  /** Efektywna delta belki do punktów: jury + obniżenie trenera (rekompensata przy ≥95% HS). */
  const effectiveGateDeltaForTargets = currentGateDelta + coachGateDelta;

  const distanceForTargetPoints = (targetPoints: number): number => {
    const windPoints = windCompPoints(pendingWind);
    const gatePoints = -effectiveGateDeltaForTargets * hill.scoring.pointsPerGate;
    const stylePoints = includeStyle ? avgStylePoints : 0;
    const needed = targetPoints - windPoints - gatePoints - stylePoints;
    const distance = hill.kPoint + (needed - 60) / hill.scoring.pointsPerMeter;
    return roundDistance(distance);
  };

  const toBeatDistance = useMemo(() => {
    if (results.length === 0) return null;
    const target = Math.max(0, leaderTotal + 0.1 - currentTotalBefore);
    return distanceForTargetPoints(target);
  }, [results, leaderTotal, currentTotalBefore, pendingWind, effectiveGateDeltaForTargets, avgStylePoints, includeStyle]);

  const toAdvanceDistance = useMemo(() => {
    if (kind === 'training' || kind === 'trial') return null;
    if (kind === 'individual' && roundIndex === 0) {
      const guaranteedAdvancePlaces = 30 - (totalJumpsInRound - completedJumpsInRound);
      if (guaranteedAdvancePlaces <= 0) return null;
      const sorted = [...currentIndividualStandings].sort((a, b) => b.totalPoints - a.totalPoints);
      const cutoffIndex = Math.min(sorted.length - 1, guaranteedAdvancePlaces - 1);
      const cutoff = sorted[cutoffIndex]?.totalPoints ?? sorted[sorted.length - 1]?.totalPoints ?? 0;
      const target = Math.max(0, cutoff + 0.1 - currentTotalBefore);
      return distanceForTargetPoints(target);
    }
    if (kind === 'team_men_pairs') {
      const sorted = [...currentTeamStandings].sort((a, b) => b.totalPoints - a.totalPoints);
      const cutoffIndex = roundIndex === 0 ? 11 : roundIndex === 1 ? 7 : -1;
      if (cutoffIndex >= 0 && sorted.length > cutoffIndex) {
        const cutoff = sorted[cutoffIndex]!.totalPoints;
        const target = Math.max(0, cutoff + 0.1 - currentTotalBefore);
        return distanceForTargetPoints(target);
      }
    }
    return null;
  }, [kind, roundIndex, currentIndividualStandings, currentTeamStandings, currentTotalBefore, pendingWind, effectiveGateDeltaForTargets, avgStylePoints, includeStyle, completedJumpsInRound, totalJumpsInRound]);

  const genderKeyForJumper = (jumper: Jumper): 'men' | 'women' => (jumper.gender === 'women' ? 'women' : 'men');

  const computeAutoGateDelta = (params: {
    currentGateDelta: number;
    currentStartGate: number;
    nextWind: Wind;
    recentResults: JumpResult[];
    nextItems: JumpQueueItem[];
    jumpsSinceChange: number;
  }): {
    nextGateDelta: number;
    debug: {
      recentScore: number;
      futureScore: number;
      windScore: number;
      totalScore: number;
      lastOvershootBoost: number;
      eliteShortBoost: number;
      overshootRatio: number;
      shortRatio: number;
      lowerThreshold: number;
      raiseThreshold: number;
      minJumpsBetweenChanges: number;
      jumpsSinceChange: number;
    };
  } => {
    const {
      currentGateDelta,
      currentStartGate,
      nextWind,
      recentResults,
      nextItems,
      jumpsSinceChange,
    } = params;

    if (!canAutoGate) {
      return {
        nextGateDelta: currentGateDelta,
        debug: {
          recentScore: 0,
          futureScore: 0,
          windScore: 0,
          totalScore: 0,
          lastOvershootBoost: 0,
          eliteShortBoost: 0,
          overshootRatio: 0,
          shortRatio: 0,
          lowerThreshold: 0,
          raiseThreshold: 0,
          minJumpsBetweenChanges: 0,
          jumpsSinceChange,
        },
      };
    }

    const riskFactor = BRAVERY_RISK_FACTOR[juryBravery] ?? 1;
    const overshootTarget = BRAVERY_OVERSHOOT_TARGET[juryBravery] ?? 0.05;
    const lowerBraveryFactor =
      juryBravery === JuryBravery.VeryLow ? 0.95 :
        juryBravery === JuryBravery.Low ? 1.0 :
          juryBravery === JuryBravery.Medium ? 1.08 :
            juryBravery === JuryBravery.High ? 1.18 : 1.28;
    const lowerThreshold = 0.54 * lowerBraveryFactor;
    const raiseThreshold = 1.65 / riskFactor;

    const baseCooldown = includeStyle ? 8 : 5;
    const cooldownDrop =
      nextWind.instability > 0.75 ? 2 : nextWind.instability > 0.55 ? 1 : 0;
    const minJumpsBetweenChanges = Math.max(2, baseCooldown - cooldownDrop);

    const lastResults = recentResults.slice(-6);
    let weightedSum = 0;
    let weightTotal = 0;
    let distanceSum = 0;
    let qualitySum = 0;
    lastResults.forEach((r, idx) => {
      const score = distanceScore(r.result.distance, hill.kPoint, hill.realHs);
      const quality = jumperQuality(r.jumper, hill.kPoint);
      const skillWeight =
        score >= 0
          ? 1 + Math.max(0, (5 - quality) / 6)
          : 1 + Math.max(0, (quality - 5) / 6);
      const recency = 0.85 + idx * 0.05;
      weightedSum += score * skillWeight * recency;
      weightTotal += skillWeight * recency;
      distanceSum += r.result.distance;
      qualitySum += quality;
    });
    const recentScore = weightTotal > 0 ? weightedSum / weightTotal : 0;
    const avgDistance = lastResults.length > 0 ? distanceSum / lastResults.length : hill.kPoint;
    const avgQuality = lastResults.length > 0 ? qualitySum / lastResults.length : 5;
    const lastJump = lastResults[lastResults.length - 1];
    const currentRoundIndex = lastJump?.roundIndex ?? 0;
    let jumpsInCurrentRound = 0;
    for (let i = recentResults.length - 1; i >= 0; i -= 1) {
      if (recentResults[i]!.roundIndex !== currentRoundIndex) break;
      jumpsInCurrentRound += 1;
    }
    const hsRange = Math.max(1, hill.realHs - hill.kPoint);
    const lastOvershootBoost =
      lastJump && lastJump.result.distance > hill.realHs
        ? clamp((lastJump.result.distance - hill.realHs) / hsRange, 0, 0.6)
        : 0;

    const upcoming = nextItems.slice(0, 5);
    let overshootNext = 0;
    let shortNext = 0;
    let overshootRest = 0;
    let shortRest = 0;
    const effectiveGate = currentStartGate + currentGateDelta;
    const simWind = nextWind;
    const simCount = 15;
    if (upcoming.length > 0) {
      const next = upcoming[0]!;
      const simJumper = toSimulationJumper(next.jumper);
      for (let i = 0; i < simCount; i += 1) {
        const jump = gateSimulator.simulate({
          jumper: simJumper,
          hill: { simulationData: { kPoint: hill.kPoint, realHs: hill.realHs, metersByGate: hill.metersByGate } },
          gate: effectiveGate,
          wind: simWind,
          roundKind: includeStyle ? 'competition' : 'training',
        });
        if (jump.distance > hill.realHs) overshootNext += 1;
        if (jump.distance < hill.kPoint - 4) shortNext += 1;
      }
      const rest = upcoming.slice(1);
      for (const item of rest) {
        const simRest = toSimulationJumper(item.jumper);
        for (let i = 0; i < simCount; i += 1) {
          const jump = gateSimulator.simulate({
            jumper: simRest,
            hill: { simulationData: { kPoint: hill.kPoint, realHs: hill.realHs, metersByGate: hill.metersByGate } },
            gate: effectiveGate,
            wind: simWind,
            roundKind: includeStyle ? 'competition' : 'training',
          });
          if (jump.distance > hill.realHs) overshootRest += 1;
          if (jump.distance < hill.kPoint - 4) shortRest += 1;
        }
      }
    }
    const restCount = Math.max(0, upcoming.length - 1);
    const overshootNextRatio = upcoming.length > 0 ? overshootNext / simCount : 0;
    const shortNextRatio = upcoming.length > 0 ? shortNext / simCount : 0;
    const overshootRestRatio = restCount > 0 ? overshootRest / (simCount * restCount) : 0;
    const shortRestRatio = restCount > 0 ? shortRest / (simCount * restCount) : 0;
    const overshootRatio =
      restCount > 0 ? overshootNextRatio * 0.7 + overshootRestRatio * 0.3 : overshootNextRatio;
    const shortRatio =
      restCount > 0 ? shortNextRatio * 0.7 + shortRestRatio * 0.3 : shortNextRatio;
    const overshootPressure = Math.max(0, overshootRatio - overshootTarget);
    const overshootDeficit = Math.max(0, overshootTarget * 0.6 - overshootRatio);
    const shortPressure = Math.max(0, shortRatio - 0.35);
    const futureScore = overshootPressure * 3.0 - shortPressure * 1.3 - overshootDeficit * 0.9;
    const windScore =
      nextWind.average >= 0
        ? clamp(nextWind.average * 0.12, 0, 0.6)
        : clamp(nextWind.average * 0.04, -0.2, 0);
    const eliteShort =
      recentResults.length >= 10 &&
      avgQuality >= 7.4 &&
      avgDistance <= hill.kPoint - 2;
    const eliteShortBoost = eliteShort ? -0.35 : 0;
    const totalScore =
      recentScore * 0.85 +
      futureScore * 0.95 +
      windScore * 0.15 +
      lastOvershootBoost * 0.9 +
      eliteShortBoost;
    const sampleFactor = clamp(recentResults.length / 6, 0.35, 1);
    const proximityFactor = clamp((avgDistance - (hill.realHs - 3)) / 4, 0, 1);
    const overshootSensitivity =
      juryBravery === JuryBravery.VeryHigh ? 0.45 :
        juryBravery === JuryBravery.High ? 0.6 :
          1;
    const lowerScore =
      (recentScore * 0.85 +
        futureScore * 0.95 * overshootSensitivity * proximityFactor +
        windScore * 0.15 +
        lastOvershootBoost * 0.9 * overshootSensitivity * proximityFactor +
        eliteShortBoost) * sampleFactor;

    const strongSignal =
      Math.abs(lowerScore) > 1.1 || overshootRatio > 0.45 || shortRatio > 0.6;

    if (includeStyle && recentResults.length < 2) {
      return {
        nextGateDelta: currentGateDelta,
        debug: {
          recentScore,
          futureScore,
          windScore,
          totalScore,
          lastOvershootBoost,
          eliteShortBoost,
          overshootRatio,
          shortRatio,
          lowerThreshold,
          raiseThreshold,
          minJumpsBetweenChanges,
          jumpsSinceChange,
        },
      };
    }

    const lowerConfidenceFactor =
      juryBravery === JuryBravery.VeryHigh ? 2.5 :
        juryBravery === JuryBravery.High ? 1.95 :
          juryBravery === JuryBravery.Medium ? 1.05 :
            juryBravery === JuryBravery.Low ? 1.0 : 0.95;
    const overshootRatioTrigger =
      juryBravery === JuryBravery.VeryHigh ? 0.95 :
        juryBravery === JuryBravery.High ? 0.9 :
          0.65;
    const overshootBoostTrigger =
      juryBravery === JuryBravery.VeryHigh ? 0.55 :
        juryBravery === JuryBravery.High ? 0.45 :
          0.25;
    const earlyPhase = recentResults.length < 4;
    const earlySecondRound = currentRoundIndex > 0 && jumpsInCurrentRound < 4;
    const overshootCertain =
      overshootRatio > overshootRatioTrigger || lastOvershootBoost > overshootBoostTrigger;
    const avgCloseToHs = avgDistance >= hill.realHs - 1.2;
    const veryHighExtremeOvershoot = overshootRatio > 0.98 || lastOvershootBoost > 0.6;
    const highExtremeOvershoot = overshootRatio > 0.96 || lastOvershootBoost > 0.5;
    const earlyPhaseAllow =
      !earlyPhase ||
      overshootCertain ||
      (overshootRatio > 0.6 && avgCloseToHs) ||
      (juryBravery === JuryBravery.VeryHigh && veryHighExtremeOvershoot) ||
      (juryBravery === JuryBravery.High && highExtremeOvershoot);
    const weakAndShortEarly =
      recentResults.length < 6 && avgDistance < hill.realHs - 2 && overshootRatio < 0.85;
    const clearlyNotClose =
      avgDistance < hill.kPoint + 1 && overshootRatio < 0.8 && lastOvershootBoost < 0.4;
    const seriouslyShort = avgDistance <= hill.kPoint + 1.5;
    const shouldLower =
      earlyPhaseAllow &&
      !earlySecondRound &&
      !weakAndShortEarly &&
      !clearlyNotClose &&
      !seriouslyShort &&
      (overshootCertain || lowerScore > lowerThreshold * lowerConfidenceFactor);

    if (shouldLower) {
      let lowerStep =
        lowerScore > lowerThreshold * 3 || overshootRatio > 0.75
          ? 3
          : lowerScore > lowerThreshold * 2 || overshootRatio > 0.6
            ? 2
            : 1;
      if (juryBravery === JuryBravery.VeryHigh) {
        if (!veryHighExtremeOvershoot) lowerStep = Math.min(lowerStep, 1);
      } else if (juryBravery === JuryBravery.High) {
        if (!highExtremeOvershoot) lowerStep = Math.min(lowerStep, 1);
      }
      return {
        nextGateDelta: Math.max(-GATE_DELTA_RANGE, currentGateDelta - lowerStep),
        debug: {
          recentScore,
          futureScore,
          windScore,
          totalScore,
          lastOvershootBoost,
          eliteShortBoost,
          overshootRatio,
          shortRatio,
          lowerThreshold,
          raiseThreshold,
          minJumpsBetweenChanges,
          jumpsSinceChange,
        },
      };
    }
    const isTailwind = nextWind.average < -0.3;
    const goodButShort = avgQuality >= 7.3 && avgDistance <= hill.kPoint + 1.2;
    const weakAndStruggling = avgQuality <= 4.8 && avgDistance <= hill.kPoint - 6;
    const severeShort = avgDistance <= hill.kPoint - 7 || shortRatio > 0.6;
    const raiseStrictness =
      juryBravery === JuryBravery.VeryLow
        ? 2.8
        : juryBravery === JuryBravery.Low
          ? 2.2
          : juryBravery === JuryBravery.Medium
            ? 1.45
            : 1.25;
    const gateMeters = Math.abs(currentGateDelta) * hill.metersByGate;
    const raiseTrustFactor = 1 + Math.max(0, gateMeters / 3);
    const raiseDelayOk =
      !includeStyle ||
      recentResults.length >= 16 ||
      severeShort ||
      eliteShort;
    const nextQuality = nextItems.length > 0 ? jumperQuality(nextItems[0]!.jumper, hill.kPoint) : avgQuality;
    const hadWeakLowGate =
      lastResults.some(
        (r) =>
          jumperQuality(r.jumper, hill.kPoint) <= 5.1 &&
          (r.gate - currentStartGate) <= -2 &&
          r.result.distance <= hill.kPoint + 0.5
      );
    const blockRaiseForBetterAfterWeakLowGate =
      hadWeakLowGate && nextQuality >= 6.6;

    const earlyRaisePhase = recentResults.length < (includeStyle ? 10 : 6);
    const extremeShort = avgDistance <= hill.kPoint - 9 || shortRatio > 0.75;
    const raiseAllowed =
      ((goodButShort && avgDistance <= hill.kPoint + 0.3) ||
        (weakAndStruggling && avgDistance <= hill.kPoint - 7) ||
        severeShort) &&
      !blockRaiseForBetterAfterWeakLowGate &&
      (juryBravery === JuryBravery.Low || juryBravery === JuryBravery.VeryLow
        ? severeShort && avgDistance <= hill.kPoint - 7
        : true) &&
      (!earlyRaisePhase || extremeShort);
    const tailwindBlock =
      isTailwind && !(avgDistance <= hill.kPoint - 8 && shortRatio > 0.65);
    const allowRaise = recentResults.length > 0;
    const shouldRaise =
      allowRaise &&
      raiseAllowed &&
      !tailwindBlock &&
      raiseDelayOk &&
      totalScore < -raiseThreshold * raiseStrictness * raiseTrustFactor;
    const raiseStep =
      severeShort && (totalScore < -raiseThreshold * raiseStrictness * raiseTrustFactor * 1.9 || shortRatio > 0.8)
        ? 3
        : severeShort && totalScore < -raiseThreshold * raiseStrictness * raiseTrustFactor * 1.45
          ? 2
          : 1;
    return {
      nextGateDelta: shouldRaise ? Math.min(GATE_DELTA_RANGE, currentGateDelta + raiseStep) : currentGateDelta,
      debug: {
        recentScore,
        futureScore,
        windScore,
        totalScore,
        lastOvershootBoost,
        eliteShortBoost,
        overshootRatio,
        shortRatio,
        lowerThreshold,
        raiseThreshold,
        minJumpsBetweenChanges,
        jumpsSinceChange,
      },
    };
  };

  const simulateJump = (
    item: JumpQueueItem,
    wind: Wind,
    currentGateDelta: number,
    coachGateDelta: number,
    currentStartGate: number
  ): JumpResult => {
    const simJumper = toSimulationJumper(item.jumper);
    const totalGateDelta = clamp(currentGateDelta + coachGateDelta, -GATE_DELTA_RANGE, GATE_DELTA_RANGE);
    const appliedCoachDelta = totalGateDelta - currentGateDelta;
    const effectiveGate = currentStartGate + totalGateDelta;
    const ctx = {
      jumper: simJumper,
      hill: { simulationData: { kPoint: hill.kPoint, realHs: hill.realHs, metersByGate: hill.metersByGate } },
      gate: effectiveGate,
      wind,
      roundKind: includeStyle ? 'competition' : 'training',
    } as const;
    const jump = simulator.simulate(ctx);
    const distance = roundDistance(jump.distance);
    const distancePoints = scoring.distancePoints(distance, hill.kPoint, hill.scoring);
    const windPoints = windCompPoints(wind);
    const threshold95Hs = Math.floor((hill.realHs * 0.95) * 2) / 2;
    const coachCompAllowed = appliedCoachDelta < 0 && distance >= threshold95Hs;
    const gateCompensationDelta = currentGateDelta + (coachCompAllowed ? appliedCoachDelta : 0);
    const gatePoints = -gateCompensationDelta * hill.scoring.pointsPerGate;
    const styleCtx = {
      landing: jump.landing,
      distance,
      realHs: hill.realHs,
      kPoint: hill.kPoint,
      landingTendency: simJumper.skills.landingTendency,
      random,
    };
    const scoringWithNotes = scoring as typeof scoring & {
      styleNotes?: (ctx: Parameters<typeof scoring.stylePoints>[0]) => StyleNotesResult;
    };
    const styleResult = includeStyle
      ? scoringWithNotes.styleNotes?.(styleCtx) ?? styleNotesFallback(styleCtx)
      : null;
    const stylePoints = styleResult?.sum;
    const points = Math.max(0, distancePoints + windPoints + gatePoints + (stylePoints ?? 0));
    const res: JumpResult = {
      id: item.id,
      roundIndex: item.roundIndex,
      bib: item.bib,
      jumper: item.jumper,
      teamId: item.teamId,
      slotInTeam: item.slotInTeam,
      gate: effectiveGate,
      gateDelta: totalGateDelta,
      gateDeltaJury: currentGateDelta,
      gateDeltaCoach: appliedCoachDelta,
      gateCompensationDelta,
      wind,
      result: {
        distance,
        landing: jump.landing,
        points,
        gateDelta: totalGateDelta,
        wind,
        ...(stylePoints != null ? { stylePoints } : {}),
      },
      styleNotes: styleResult?.notes ?? null,
    };
    return res;
  };

  const handleNextJump = (): void => {
    if (!currentItem || isRoundComplete) return;
    if (gateHighlight) setGateHighlight(false);
    const genderKey = genderKeyForJumper(currentItem.jumper);
    const currentStartGate = startGateForJumper(currentItem.jumper);
    const currentGateDelta = gateDeltaForJumper(currentItem.jumper);
    const previousGenderResults = results.filter(
      (r) => r.roundIndex === roundIndex && genderKeyForJumper(r.jumper) === genderKey
    );
    const res = simulateJump(currentItem, pendingWind, currentGateDelta, coachGateDelta, currentStartGate);
    const nextItems = queue
      .slice(queueIndex + 1)
      .filter((item) => genderKeyForJumper(item.jumper) === genderKey);
    const jumpsSinceChange = previousGenderResults.length + 1 - lastGateChangeJump[genderKey];
    const nextWind = windProvider.getWind();
    const gateDecision = computeAutoGateDelta({
      currentGateDelta,
      currentStartGate,
      nextWind,
      recentResults: [...previousGenderResults, res],
      nextItems,
      jumpsSinceChange,
    });
    const nextGateDelta = gateDecision.nextGateDelta;
    console.log('[SJSIM][AUTO-GATE]', {
      eventId: event.id,
      kind: event.type,
      gender: genderKey,
      jumpId: res.id,
      bib: res.bib,
      currentGate: res.gate,
      gateDelta: currentGateDelta,
      nextGateDelta,
      bravery: juryBravery,
      score: gateDecision.debug,
    });
    const nextResults = [...results, res];
    const nextQueueIndex = queueIndex + 1;
    const reordered = reorderQueueForNextGroup({
      sourceQueue: queue,
      nextQueueIndex,
      nextResults,
      currentItem,
    });
    if (reordered) setQueue(reordered);
    setResults(nextResults);
    setLastJumpId(res.id);
    setQueueIndex(nextQueueIndex);
    setPendingWind(nextWind);

    if (nextGateDelta !== currentGateDelta) {
      const previousGateValue = gateValueFor(genderKey, currentGateDelta);
      const nextGateValue = gateValueFor(genderKey, nextGateDelta);
      if (nextGateValue === previousGateValue) {
        return;
      }
      if (genderKey === 'women') {
        setGateDeltaWomen(nextGateDelta);
      } else {
        setGateDeltaMen(nextGateDelta);
      }
      setLastGateChangeJump((prev) => ({
        ...prev,
        [genderKey]: previousGenderResults.length + 1,
      }));
      setGateHighlight(true);
    }
  };

  const handleAutoSimulateRound = (): void => {
    if (isRoundComplete) return;
    if (gateHighlight) setGateHighlight(false);
    setAutoJump(false);
    let currentWind = pendingWind;
    const initialGateDeltaMen = gateDeltaMen;
    const initialGateDeltaWomen = gateDeltaWomen;
    let gateValueChanged = false;
    let currentGateDeltaMen = gateDeltaMen;
    let currentGateDeltaWomen = gateDeltaWomen;
    const currentLastGateChange = { ...lastGateChangeJump };
    const newResults: JumpResult[] = [];
    const baseRoundResults = results.filter((r) => r.roundIndex === roundIndex);
    const recentResultsByGender = {
      men: baseRoundResults.filter((r) => genderKeyForJumper(r.jumper) === 'men'),
      women: baseRoundResults.filter((r) => genderKeyForJumper(r.jumper) === 'women'),
    };
    const genderJumpCounts = {
      men: recentResultsByGender.men.length,
      women: recentResultsByGender.women.length,
    };
    let workingQueue = [...queue];
    for (let i = queueIndex; i < workingQueue.length; i += 1) {
      const item = workingQueue[i]!;
      const genderKey = genderKeyForJumper(item.jumper);
      const currentStartGate = startGateForJumper(item.jumper);
      const currentGateDelta = genderKey === 'women' ? currentGateDeltaWomen : currentGateDeltaMen;
      const res = simulateJump(item, currentWind, currentGateDelta, 0, currentStartGate);
      const nextItems = workingQueue
        .slice(i + 1)
        .filter((entry) => genderKeyForJumper(entry.jumper) === genderKey);
      const jumpsSinceChange = genderJumpCounts[genderKey] + 1 - currentLastGateChange[genderKey];
      const nextWind = windProvider.getWind();
      const gateDecision = computeAutoGateDelta({
        currentGateDelta,
        currentStartGate,
        nextWind,
        recentResults: [...recentResultsByGender[genderKey], res],
        nextItems,
        jumpsSinceChange,
      });
      const nextGateDelta = gateDecision.nextGateDelta;
      console.log('[SJSIM][AUTO-GATE]', {
        eventId: event.id,
        kind: event.type,
        gender: genderKey,
        jumpId: res.id,
        bib: res.bib,
        currentGate: res.gate,
        gateDelta: currentGateDelta,
        nextGateDelta,
        bravery: juryBravery,
        score: gateDecision.debug,
      });
      const nextResults = [...results, ...newResults, res];
      const reordered = reorderQueueForNextGroup({
        sourceQueue: workingQueue,
        nextQueueIndex: i + 1,
        nextResults,
        currentItem: item,
      });
      if (reordered) workingQueue = reordered;
      newResults.push(res);
      recentResultsByGender[genderKey].push(res);
      genderJumpCounts[genderKey] += 1;
      if (nextGateDelta !== currentGateDelta) {
        const previousGateValue = gateValueFor(genderKey, currentGateDelta);
        const nextGateValue = gateValueFor(genderKey, nextGateDelta);
        if (nextGateValue !== previousGateValue) {
          gateValueChanged = true;
        }
        currentLastGateChange[genderKey] = genderJumpCounts[genderKey];
      }
      if (genderKey === 'women') {
        currentGateDeltaWomen = nextGateDelta;
      } else {
        currentGateDeltaMen = nextGateDelta;
      }
      currentWind = nextWind;
    }
    if (newResults.length === 0) return;
    setQueue(workingQueue);
    setResults((prev) => [...prev, ...newResults]);
    setLastJumpId(newResults[newResults.length - 1]!.id);
    setQueueIndex(workingQueue.length);
    setGateDeltaMen(currentGateDeltaMen);
    setGateDeltaWomen(currentGateDeltaWomen);
    setLastGateChangeJump(currentLastGateChange);
    setPendingWind(currentWind);
    const hadGateChange =
      currentGateDeltaMen !== initialGateDeltaMen ||
      currentGateDeltaWomen !== initialGateDeltaWomen;
    if (hadGateChange && gateValueChanged) {
      setGateHighlight(true);
    }
  };

  const handleAdvanceRound = (): void => {
    if (roundIndex < totalRounds - 1) {
      setRoundIndex((prev) => prev + 1);
      setSelectedRowId(null);
      setLastJumpId(null);
      setTooltip(null);
    }
  };

  const handleAutoSimulateClick = (): void => {
    if (kind === 'training' || kind === 'trial') {
      handleAutoSimulateRound();
      return;
    }
    setShowAutoSimConfirm(true);
  };

  const confirmAutoSimulate = (): void => {
    setShowAutoSimConfirm(false);
    handleAutoSimulateRound();
  };

  const confirmJuryBravery = (): void => {
    setShowJuryBraveryDialog(false);
  };

  const handleManualGateToggle = (): void => {
    if (manualGate) {
      setManualGate(false);
      return;
    }
    setShowManualGateDialog(true);
  };

  const adjustGate = (delta: number): void => {
    const genderKey = currentItem ? genderKeyForJumper(currentItem.jumper) : 'men';
    if (genderKey === 'women') {
      setGateDeltaWomen((prev) => Math.max(-GATE_DELTA_RANGE, Math.min(GATE_DELTA_RANGE, prev + delta)));
      return;
    }
    setGateDeltaMen((prev) => Math.max(-GATE_DELTA_RANGE, Math.min(GATE_DELTA_RANGE, prev + delta)));
  };

  const confirmManualGate = (): void => {
    setManualGate(true);
    setShowManualGateDialog(false);
  };

  const rowDetails = useMemo(() => {
    if (!selectedRowId) return null;
    return results.find((r) => r.id === selectedRowId) ?? null;
  }, [selectedRowId, results]);

  const positionInRound = (params: { jump: JumpResult; upTo: JumpResult[] }): number | null => {
    const { jump, upTo } = params;
    const roundResults = upTo.filter((r) => r.roundIndex === jump.roundIndex);
    const totals = new Map<string, number>();
    roundResults.forEach((r) => {
      const id = jumperId(r.jumper);
      totals.set(id, (totals.get(id) ?? 0) + r.result.points);
    });
    const standings = [...totals.entries()]
      .map(([id, total]) => ({ id, total }))
      .sort((a, b) => b.total - a.total);
    const pos = standings.findIndex((s) => s.id === jumperId(jump.jumper));
    return pos >= 0 ? pos + 1 : null;
  };

  const positionInGroup = (params: { jump: JumpResult; upTo: JumpResult[] }): number | null => {
    const { jump, upTo } = params;
    if (!hasTeams || !jump.teamId || jump.slotInTeam == null) return null;
    const groupResults = upTo.filter(
      (r) => r.roundIndex === jump.roundIndex && r.slotInTeam === jump.slotInTeam
    );
    const standings = buildTeamStandings(groupResults, teams, jump.roundIndex)
      .sort((a, b) => b.totalPoints - a.totalPoints);
    return findTeamPosition(standings, jump.teamId);
  };

  const rowDetailsPosition = useMemo(() => {
    if (!rowDetails) return null;
    const idx = results.findIndex((r) => r.id === rowDetails.id);
    if (idx < 0) return null;
    const upTo = results.slice(0, idx + 1);
    if (hasTeams && rowDetails.teamId) {
      const standings = buildTeamStandings(upTo, teams, rowDetails.roundIndex)
        .sort((a, b) => b.totalPoints - a.totalPoints);
      const pos = standings.findIndex((s) => s.teamId === rowDetails.teamId);
      return pos >= 0 ? pos + 1 : null;
    }
    const standings = buildIndividualStandings(upTo, bibById, jumperById, rowDetails.roundIndex)
      .sort((a, b) => b.totalPoints - a.totalPoints);
    const pos = standings.findIndex((s) => s.jumperId === jumperId(rowDetails.jumper));
    return pos >= 0 ? pos + 1 : null;
  }, [rowDetails, results, hasTeams, teams, bibById, jumperById]);

  const rowDetailsRoundPosition = useMemo(() => {
    if (!rowDetails) return null;
    return positionInRound({ jump: rowDetails, upTo: results });
  }, [rowDetails, results, hasTeams, teams, bibById, jumperById]);

  const rowDetailsGroupPosition = useMemo(() => {
    if (!rowDetails) return null;
    if (!hasTeams || !rowDetails.teamId || rowDetails.slotInTeam == null) return null;
    const groupResults = results.filter(
      (r) => r.roundIndex === rowDetails.roundIndex && r.slotInTeam === rowDetails.slotInTeam
    );
    const standings = buildTeamStandings(groupResults, teams, rowDetails.roundIndex)
      .sort((a, b) => b.totalPoints - a.totalPoints);
    return findTeamPosition(standings, rowDetails.teamId);
  }, [rowDetails, results, hasTeams, teams]);

  const lastJumpInfo = useMemo(() => {
    if (!lastJumpId) return null;
    const jump = results.find((r) => r.id === lastJumpId);
    if (!jump) return null;
    if (hasTeams && jump.teamId) {
      const sorted = [...currentTeamStandings].sort((a, b) => b.totalPoints - a.totalPoints);
      const position = sorted.findIndex((s) => s.teamId === jump.teamId);
      return {
        label: `${jump.jumper.name} ${jump.jumper.surname}`,
        position: position >= 0 ? position + 1 : null,
        jump,
      };
    }
    const sorted = [...currentIndividualStandings].sort((a, b) => b.totalPoints - a.totalPoints);
    const position = sorted.findIndex((s) => s.jumperId === jumperId(jump.jumper));
    return {
      label: `${jump.jumper.name} ${jump.jumper.surname}`,
      position: position >= 0 ? position + 1 : null,
      jump,
    };
  }, [lastJumpId, results, hasTeams, currentTeamStandings, currentIndividualStandings, teams]);

  const lastJumpRoundPosition = useMemo(() => {
    if (!lastJumpId) return null;
    const idx = results.findIndex((r) => r.id === lastJumpId);
    if (idx < 0) return null;
    const jump = results[idx]!;
    return positionInRound({ jump, upTo: results });
  }, [lastJumpId, results, hasTeams, teams, bibById, jumperById]);

  const lastJumpGroupPosition = useMemo(() => {
    if (!lastJumpId) return null;
    const idx = results.findIndex((r) => r.id === lastJumpId);
    if (idx < 0) return null;
    const jump = results[idx]!;
    const upTo = results.slice(0, idx + 1);
    return positionInGroup({ jump, upTo });
  }, [lastJumpId, results, hasTeams, teams]);

  const gateStatusLabel = isMixedEvent
    ? `M: ${startGateByGender.men + gateDeltaMen} · K: ${startGateByGender.women + gateDeltaWomen}`
    : `${startGateByGender.men + gateDeltaMen}`;
  const showRoundPositions = hasTeams ? true : roundIndex > 0;
  const showGroupPositions = hasTeams;

  const buildEventSummary = (): EventResultsSummary | null => {
    if (results.length === 0) return null;
    const byId = new Map<string, { jumper: Jumper; total: number; rounds: Set<number> }>();
    results.forEach((r) => {
      const id = jumperId(r.jumper);
      const existing = byId.get(id);
      if (existing) {
        existing.total += r.result.points;
        existing.rounds.add(r.roundIndex);
      } else {
        byId.set(id, { jumper: r.jumper, total: r.result.points, rounds: new Set([r.roundIndex]) });
      }
    });
    const standings = [...byId.values()]
      .sort((a, b) => b.total - a.total)
      .map((entry, idx) => ({
        jumperId: jumperId(entry.jumper),
        country: entry.jumper.country,
        totalPoints: entry.total,
        rank: idx + 1,
        rounds: [...entry.rounds].sort((a, b) => a - b),
      }));
    const teamStandings = hasTeams
      ? buildTeamStandings(results, teams, totalRounds - 1)
        .sort((a, b) => b.totalPoints - a.totalPoints)
        .map((entry, idx) => ({
          teamId: entry.teamId,
          country: entry.country,
          totalPoints: entry.totalPoints,
          rank: idx + 1,
        }))
      : undefined;
    return {
      eventId: event.id,
      type: event.type,
      gender: event.gender,
      hill: event.hill,
      standings,
      ...(teamStandings ? { teamStandings } : {}),
    };
  };

  const eventSummary = useMemo(
    buildEventSummary,
    [results, event.id, event.type, event.gender, event.hill, hasTeams, teams, totalRounds]
  );

  const createArchiveEntry = (): PredazzoArchiveEntry | null => {
    if (results.length === 0) return null;
    const { label, shortLabel } = formatPredazzoArchiveLabel(event, trainingSeriesIndex);
    const archiveResults: ArchiveJumpResult[] = results.map((r) => ({
      id: r.id,
      roundIndex: r.roundIndex,
      bib: r.bib,
      jumper: r.jumper,
      teamId: r.teamId,
      slotInTeam: r.slotInTeam,
      gate: r.gate,
      gateDelta: r.gateDelta,
      gateDeltaJury: r.gateDeltaJury,
      gateDeltaCoach: r.gateDeltaCoach,
      gateCompensationDelta: r.gateCompensationDelta,
      wind: r.wind,
      result: r.result,
      styleNotes: r.styleNotes,
    }));
    return {
      id: `${event.id}-${Date.now()}`,
      source: 'predazzo',
      eventId: event.id,
      label,
      shortLabel,
      type: event.type,
      gender: event.gender,
      hill: event.hill,
      date: event.date,
      time: event.time,
      seriesIndex: event.type === 'training' ? trainingSeriesIndex : undefined,
      totalRounds,
      completedAt: new Date().toISOString(),
      isMainCompetition: event.isMainCompetition,
      results: archiveResults,
    };
  };

  return (
    <div className={`competition-screen ${isEventComplete ? 'competition-screen--complete' : ''}`}>
      {showExitDialog && (
        <div className="competition-screen__dialog-overlay" role="dialog" aria-modal="true">
          <div className="competition-screen__dialog">
            <h2 className="competition-screen__dialog-title">Opuścić konkurs?</h2>
            <p className="competition-screen__dialog-text">
              Jeśli wyjdziesz teraz, utracisz postęp w rozgrywaniu tego konkursu.
            </p>
            <div className="competition-screen__dialog-actions">
              <button type="button" className="competition-screen__btn competition-screen__btn--secondary" onClick={() => setShowExitDialog(false)}>
                Anuluj
              </button>
              <button type="button" className="competition-screen__btn competition-screen__btn--primary" onClick={() => onExit({ aborted: true })}>
                Wyjdź
              </button>
            </div>
          </div>
        </div>
      )}
      {showAutoSimConfirm && (
        <div className="competition-screen__dialog-overlay competition-screen__dialog-overlay--subtle" role="dialog" aria-modal="true" aria-labelledby="auto-sim-confirm-title">
          <div className="competition-screen__dialog competition-screen__dialog--compact">
            <p id="auto-sim-confirm-title" className="competition-screen__dialog-text">
              Na pewno pominąć pozostałe skoki w tej serii?
            </p>
            <div className="competition-screen__dialog-actions">
              <button type="button" className="competition-screen__btn competition-screen__btn--secondary" onClick={() => setShowAutoSimConfirm(false)}>
                Anuluj
              </button>
              <button type="button" className="competition-screen__btn competition-screen__btn--secondary" onClick={confirmAutoSimulate}>
                Pomiń skoki
              </button>
            </div>
          </div>
        </div>
      )}
      {showManualGateDialog && (
        <div className="competition-screen__dialog-overlay" role="dialog" aria-modal="true">
          <div className="competition-screen__dialog">
            <h2 className="competition-screen__dialog-title">Ręcznie ustawiać belkę?</h2>
            <p className="competition-screen__dialog-text">
              Od tej pory belka nie będzie ustawiana automatycznie. Skoki nie powinny być zbyt dalekie ani zbyt krótkie.
            </p>
            <div className="competition-screen__dialog-actions">
              <button type="button" className="competition-screen__btn competition-screen__btn--secondary" onClick={() => setShowManualGateDialog(false)}>
                Anuluj
              </button>
              <button type="button" className="competition-screen__btn competition-screen__btn--primary" onClick={confirmManualGate}>
                Włącz ręczne
              </button>
            </div>
          </div>
        </div>
      )}
      {showJuryBraveryDialog && isDirector && canAutoGate && results.length === 0 && (
        <div className="competition-screen__dialog-overlay" role="dialog" aria-modal="true">
          <div className="competition-screen__dialog">
            <h2 className="competition-screen__dialog-title">Odwaga jury</h2>
            <p className="competition-screen__dialog-text">
              Wybierz skłonność jury do ryzyka. To ustawienie wpływa na belkę przez cały konkurs.
            </p>
            <label className="competition-screen__jury-select">
              <span>Odwaga</span>
              <select
                value={juryBravery}
                onChange={(e) => setJuryBravery(e.target.value as JuryBravery)}
              >
                {JURY_BRAVERY_OPTIONS.map((value) => (
                  <option key={value} value={value}>
                    {JURY_BRAVERY_LABELS[value]}
                  </option>
                ))}
              </select>
            </label>
            <div className="competition-screen__dialog-actions">
              <button type="button" className="competition-screen__btn competition-screen__btn--primary" onClick={confirmJuryBravery}>
                Rozpocznij
              </button>
            </div>
          </div>
        </div>
      )}

      <header className="competition-screen__header">
        <button
          type="button"
          className="competition-screen__back"
          onClick={() =>
            isEventComplete
              ? onExit({ summary: eventSummary ?? undefined, archive: createArchiveEntry() ?? undefined })
              : setShowExitDialog(true)
          }
          aria-label="Wróć"
        >
          <BackIcon />
        </button>
        {!isEventComplete && (
          <div className="competition-screen__header-utility">
            <label className="competition-screen__auto competition-screen__auto--header">
              <input type="checkbox" checked={autoJump} onChange={(e) => setAutoJump(e.target.checked)} />
              <span>Auto</span>
            </label>
            <button
              type="button"
              className="competition-screen__btn competition-screen__btn--utility"
              onClick={handleAutoSimulateClick}
              disabled={!currentItem || isRoundComplete}
            >
              Pomiń skoki
            </button>
          </div>
        )}
        <div className="competition-screen__title">
          <h1>{event.label}</h1>
        </div>
        <div className="competition-screen__header-actions">
          {canCoachLowerGate && (
            <div className="competition-screen__coach-gate competition-screen__coach-gate--header">
              <span className="competition-screen__coach-gate-label">Belka trenera</span>
              <strong className="competition-screen__coach-gate-value">
                {coachGateDelta === 0 ? 'brak' : coachGateDelta}
              </strong>
              <button
                type="button"
                className="competition-screen__btn competition-screen__btn--secondary competition-screen__coach-gate-btn"
                onClick={() => adjustCoachGate(-1)}
                disabled={!canLowerCoachGate}
              >
                Obniż (-1)
              </button>
              {canUndoCoachGate && (
                <button
                  type="button"
                  className="competition-screen__btn competition-screen__btn--secondary competition-screen__coach-gate-btn"
                  onClick={undoCoachGate}
                >
                  Cofnij
                </button>
              )}
              <span className="competition-screen__coach-gate-95" title="Rekompensata za obniżenie belki przysługuje od tej odległości">
                95% HS = {(Math.floor((hill.realHs * 0.95) * 2) / 2).toFixed(1)} m
              </span>
            </div>
          )}
          {isDirector && (
            <button
              type="button"
              className={`competition-screen__manual-bar ${manualGate ? 'competition-screen__manual-bar--active' : ''} ${isEventComplete ? 'competition-screen__manual-bar--disabled' : ''}`}
              onClick={handleManualGateToggle}
              disabled={isEventComplete}
            >
              {manualGate ? 'Ustaw belkę automatycznie' : 'Ręcznie ustaw belkę'}
            </button>
          )}
          {isMixedEvent ? (
            <NextRoundGateHint
              menGate={startGateByGender.men + gateDeltaMen}
              womenGate={startGateByGender.women + gateDeltaWomen}
            />
          ) : (
            <NextRoundGateHint gate={currentStartGate + currentGateDelta} />
          )}
        </div>
      </header>

      <div className="competition-screen__layout">
        <aside className="competition-screen__left">
          <div className="competition-screen__round-label">
            {roundLabel(event, roundIndex)}
            <span className="competition-screen__round-progress">
              {Math.min(queueIndex + 1, totalJumpsInRound)} / {totalJumpsInRound}
            </span>
          </div>
          <ul className="competition-screen__start-list" ref={listRef}>
            {queue.map((item, idx) => {
              const hasJumped = idx < queueIndex;
              const isCurrent = item.id === currentItem?.id;
              const flag = countryToFlag(item.jumper.country);
              return (
                <li
                  key={item.id}
                  data-jump-id={item.id}
                  className={`competition-screen__start-row ${hasJumped ? 'competition-screen__start-row--done' : ''} ${isCurrent ? 'competition-screen__start-row--current' : ''}`}
                >
                  <span className="competition-screen__start-bib">{item.bib}</span>
                  <span className="competition-screen__start-flag">{flag}</span>
                  <span className="competition-screen__start-name">
                    {item.jumper.name} {item.jumper.surname}
                  </span>
                </li>
              );
            })}
          </ul>
        </aside>

        <main className="competition-screen__center">
          <div className="competition-screen__table-wrap">
            {hasTeams ? (
              <TeamResultsTable
                teams={teams}
                results={results}
                lastJumpId={lastJumpId}
                selectedRowId={selectedRowId}
                totalRounds={totalRounds}
                onSelectRow={(id, pos) => {
                  setSelectedRowId(id);
                  setTooltip({ id, ...pos });
                }}
              />
            ) : (
              <IndividualResultsTable
                results={results}
                totalRounds={totalRounds}
                lastJumpId={lastJumpId}
                selectedRowId={selectedRowId}
                onSelectRow={(id, pos) => {
                  setSelectedRowId(id);
                  setTooltip({ id, ...pos });
                }}
                gender={event.gender}
              />
            )}
          </div>
          {rowDetails && tooltip && tooltip.id === rowDetails.id && (
            <>
              <div
                className="competition-screen__tooltip-backdrop"
                onClick={() => setTooltip(null)}
                aria-hidden
              />
              <div
                className="competition-screen__tooltip"
                style={{ left: tooltip.x, top: tooltip.y }}
                role="dialog"
                ref={tooltipRef}
              >
                <div className="competition-screen__details-content">
                  <div className="competition-screen__details-header">
                    <span className="competition-screen__details-name">
                      {countryToFlag(rowDetails.jumper.country)} {rowDetails.jumper.name} {rowDetails.jumper.surname}
                    </span>
                    <span className="competition-screen__details-bib">{rowDetails.bib}</span>
                  </div>
                  <div className="competition-screen__details-hero">
                    <span>Odległość</span>
                    <strong>{rowDetails.result.distance.toFixed(1)} m</strong>
                    <span>Miejsce</span>
                    <strong>{rowDetailsPosition ?? '—'}</strong>
                    {showRoundPositions && (
                      <>
                        <span>Pozycja w rundzie</span>
                        <strong>{rowDetailsRoundPosition ?? '—'}</strong>
                      </>
                    )}
                    {showGroupPositions && (
                      <>
                        <span>Pozycja w grupie</span>
                        <strong>{rowDetailsGroupPosition ?? '—'}</strong>
                      </>
                    )}
                    <span>Punkty</span>
                    <strong>{rowDetails.result.points.toFixed(1)}</strong>
                  </div>
                  <div className="competition-screen__details-grid">
                    <span>Wiatr (avg)</span>
                    <strong className={valColorClass(rowDetails.wind.average, 'wind')}>
                      {rowDetails.wind.average.toFixed(2)} m/s
                    </strong>
                    <span>Belka</span>
                    <strong>
                      {rowDetails.gate}
                      {rowDetails.gateDelta !== 0 && (
                        <span className={`competition-screen__gate-delta competition-screen__gate-delta--${rowDetails.gateDelta > 0 ? 'plus' : 'minus'}`}>
                          {' '}({rowDetails.gateDelta > 0 ? '+' : ''}{rowDetails.gateDelta})
                        </span>
                      )}
                    </strong>
                    <span>Rek. wiatr</span>
                    <strong className={valColorClass(windCompPoints(rowDetails.wind), 'comp')}>
                      {windCompPoints(rowDetails.wind).toFixed(1)}
                    </strong>
                    <span>Rek. belka</span>
                    <strong className={valColorClass(-rowDetails.gateCompensationDelta * hill.scoring.pointsPerGate, 'comp')}>
                      {(-rowDetails.gateCompensationDelta * hill.scoring.pointsPerGate).toFixed(1)}
                    </strong>
                    {includeStyle && (
                      <>
                        <span>Noty</span>
                        <strong>{rowDetails.result.stylePoints != null ? formatStylePoints(rowDetails.result.stylePoints) : '—'}</strong>
                        <div className="competition-screen__style-notes-row">
                          <strong className="competition-screen__style-notes">
                            {formatStyleNotes(rowDetails.styleNotes)}
                          </strong>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </main>

        <aside className="competition-screen__right">
          <div className="competition-screen__next">
            <p className="competition-screen__next-title">
              {event.gender === 'women' ? 'Następna zawodniczka' : 'Następny zawodnik'}
            </p>
            {currentItem ? (
              <div className="competition-screen__next-row">
                <span className="competition-screen__next-flag">{countryToFlag(currentItem.jumper.country)}</span>
                <span className="competition-screen__next-name">
                  {nextJumperPositionAfterRound1 != null && (
                    <span className="competition-screen__next-place">({nextJumperPositionAfterRound1}. po 1. serii)</span>
                  )}
                  {currentItem.jumper.name} {currentItem.jumper.surname}
                </span>
              </div>
            ) : (
              <p className="competition-screen__next-empty">Seria zakończona</p>
            )}
          </div>

          <div className="competition-screen__wind">
            <span className="competition-screen__to-beat-label">Uśredniony wiatr</span>
            <strong className={valColorClass(avgWind, 'wind')}>
              {avgWind.toFixed(2)} m/s
            </strong>
          </div>

          {!isEventComplete && (
            <div className="competition-screen__to-beat">
              <div className="competition-screen__to-beat-row">
                <span className="competition-screen__to-beat-label">To beat</span>
                <strong>{toBeatDistance != null ? `${toBeatDistance.toFixed(1)} m` : '—'}</strong>
              </div>
              {toAdvanceDistance != null && (
                <div className="competition-screen__to-beat-row competition-screen__to-beat-row--secondary">
                  <span className="competition-screen__to-beat-label">Czarna linia</span>
                  <strong>{toAdvanceDistance.toFixed(1)} m</strong>
                </div>
              )}
            </div>
          )}

          {lastJumpInfo && (
            <div className="competition-screen__last">
              <p className="competition-screen__next-title">Ostatni skok</p>
              <div className="competition-screen__last-row competition-screen__details-header">
                <span className="competition-screen__details-name">
                  <span className="competition-screen__next-flag">{countryToFlag(lastJumpInfo.jump.jumper.country)}</span>
                  {lastJumpInfo.label}
                </span>
                <span className="competition-screen__details-bib">{lastJumpInfo.jump.bib}</span>
              </div>
              <div className="competition-screen__details-hero competition-screen__last-hero">
                <span>Odległość</span>
                <strong>{lastJumpInfo.jump.result.distance.toFixed(1)} m</strong>
                <span>Miejsce</span>
                <strong>{lastJumpInfo.position ?? '—'}</strong>
                <span>Punkty</span>
                <strong>{lastJumpInfo.jump.result.points.toFixed(1)}</strong>
              </div>
              <div className="competition-screen__last-meta">
                <span>Wiatr (avg)</span>
                <strong className={valColorClass(lastJumpInfo.jump.wind.average, 'wind')}>
                  {lastJumpInfo.jump.wind.average.toFixed(2)} m/s
                </strong>
                <span>Belka</span>
                <strong>
                  {lastJumpInfo.jump.gate}
                  {lastJumpInfo.jump.gateDelta !== 0 && (
                    <span className={`competition-screen__gate-delta competition-screen__gate-delta--${lastJumpInfo.jump.gateDelta > 0 ? 'plus' : 'minus'}`}>
                      {' '}({lastJumpInfo.jump.gateDelta > 0 ? '+' : ''}{lastJumpInfo.jump.gateDelta})
                    </span>
                  )}
                </strong>
                <span>Rek. wiatr</span>
                <strong className={valColorClass(windCompPoints(lastJumpInfo.jump.wind), 'comp')}>
                  {windCompPoints(lastJumpInfo.jump.wind).toFixed(1)}
                </strong>
                <span>Rek. belka</span>
                <strong className={valColorClass(-lastJumpInfo.jump.gateCompensationDelta * hill.scoring.pointsPerGate, 'comp')}>
                  {(-lastJumpInfo.jump.gateCompensationDelta * hill.scoring.pointsPerGate).toFixed(1)}
                </strong>
                {includeStyle && (
                  <>
                    <span>Noty</span>
                    <strong>{lastJumpInfo.jump.result.stylePoints != null ? formatStylePoints(lastJumpInfo.jump.result.stylePoints) : '—'}</strong>
                    <div className="competition-screen__style-notes-row">
                      <strong className="competition-screen__style-notes">
                        {formatStyleNotes(lastJumpInfo.jump.styleNotes)}
                      </strong>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          <div className="competition-screen__actions">
            {!isEventComplete && (
              <>
                {manualGate && (
                  <div className="competition-screen__gate-controls">
                    <button type="button" className="competition-screen__btn competition-screen__btn--secondary" onClick={() => adjustGate(-1)}>
                      -1 belka
                    </button>
                    <button type="button" className="competition-screen__btn competition-screen__btn--secondary" onClick={() => adjustGate(1)}>
                      +1 belka
                    </button>
                  </div>
                )}
                <div className="competition-screen__simulate-wrap">
                  <button type="button" className="competition-screen__btn competition-screen__btn--primary" onClick={handleNextJump} disabled={!currentItem}>
                    Następny skok
                  </button>
                  {gateHighlight && (
                    <div className="competition-screen__gate-change-inline">
                      Zmiana belki: {gateStatusLabel}
                    </div>
                  )}
                </div>
                {isRoundComplete && (
                  <button type="button" className="competition-screen__btn competition-screen__btn--secondary" onClick={handleAdvanceRound}>
                    Przejdź do kolejnej serii
                  </button>
                )}
              </>
            )}
            {isEventComplete && (
              <button
                type="button"
                className="competition-screen__btn competition-screen__btn--highlight"
                onClick={() => onExit({ summary: eventSummary ?? undefined, archive: createArchiveEntry() ?? undefined })}
              >
                Zakończ skoki
              </button>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
};

interface IndividualResultsTableProps {
  results: JumpResult[];
  totalRounds: number;
  lastJumpId: string | null;
  selectedRowId: string | null;
  onSelectRow: (id: string, pos: { x: number; y: number }) => void;
  gender: ScheduleItem['gender'];
}

function IndividualResultsTable({
  results,
  totalRounds,
  lastJumpId,
  selectedRowId,
  onSelectRow,
  gender,
}: IndividualResultsTableProps): JSX.Element {
  const handleSelect = (id: string, e?: MouseEvent<HTMLElement>): void => {
    if (e) e.stopPropagation();
    onSelectRow(id, { x: (e?.clientX ?? 0) + 12, y: (e?.clientY ?? 0) - 80 });
  };
  const rows = useMemo(() => {
    const byId = new Map<string, { jumper: Jumper; r1?: JumpResult; r2?: JumpResult; total: number }>();
    results.forEach((r) => {
      const id = jumperId(r.jumper);
      const existing = byId.get(id);
      if (existing) {
        existing.total += r.result.points;
        if (r.roundIndex === 0) existing.r1 = r;
        if (r.roundIndex === 1) existing.r2 = r;
      } else {
        byId.set(id, {
          jumper: r.jumper,
          total: r.result.points,
          ...(r.roundIndex === 0 ? { r1: r } : {}),
          ...(r.roundIndex === 1 ? { r2: r } : {}),
        });
      }
    });
    return [...byId.values()].sort((a, b) => b.total - a.total);
  }, [results]);

  return (
    <table className="competition-screen__table">
      <thead>
        <tr>
          <th>M.</th>
          <th>{gender === 'women' ? 'ZAWODNICZKA' : 'ZAWODNIK'}</th>
          <th>Odległość 1</th>
          <th>Punkty 1</th>
          {totalRounds > 1 && (
            <>
              <th>Odległość 2</th>
              <th>Punkty 2</th>
              <th>Nota</th>
            </>
          )}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, idx) => {
          const activeId = row.r2?.id ?? row.r1?.id ?? null;
          const isLast = Boolean(lastJumpId && lastJumpId === activeId);
          const isSelected = Boolean(selectedRowId && selectedRowId === activeId);
          return (
            <tr
              key={jumperId(row.jumper)}
              className={`${isLast ? 'competition-screen__row--last' : ''} ${isSelected ? 'competition-screen__row--selected' : ''}`}
              onClick={(e) => activeId && handleSelect(activeId, e)}
            >
              <td>{idx + 1}</td>
              <td className="competition-screen__cell-name">
                <span className="competition-screen__flag">{countryToFlag(row.jumper.country)}</span>
                {row.jumper.name} {row.jumper.surname}
              </td>
              <td
                className={row.r1 ? 'competition-screen__cell-clickable' : undefined}
                onClick={(e) => row.r1 && handleSelect(row.r1.id, e)}
              >
                {row.r1 ? `${row.r1.result.distance.toFixed(1)} m` : '—'}
              </td>
              <td
                className={row.r1 ? 'competition-screen__cell-clickable' : undefined}
                onClick={(e) => row.r1 && handleSelect(row.r1.id, e)}
              >
                {row.r1 ? row.r1.result.points.toFixed(1) : '—'}
              </td>
              {totalRounds > 1 && (
                <>
                  <td
                    className={row.r2 ? 'competition-screen__cell-clickable' : undefined}
                    onClick={(e) => row.r2 && handleSelect(row.r2.id, e)}
                  >
                    {row.r2 ? `${row.r2.result.distance.toFixed(1)} m` : '—'}
                  </td>
                  <td
                    className={row.r2 ? 'competition-screen__cell-clickable' : undefined}
                    onClick={(e) => row.r2 && handleSelect(row.r2.id, e)}
                  >
                    {row.r2 ? row.r2.result.points.toFixed(1) : '—'}
                  </td>
                  <td className="competition-screen__cell-total">{row.r1 ? row.total.toFixed(1) : '—'}</td>
                </>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

interface TeamResultsTableProps {
  teams: TeamEntry[];
  results: JumpResult[];
  lastJumpId: string | null;
  selectedRowId: string | null;
  onSelectRow: (id: string, pos: { x: number; y: number }) => void;
  totalRounds: number;
}

function TeamResultsTable({
  teams,
  results,
  lastJumpId,
  selectedRowId,
  onSelectRow,
  totalRounds,
}: TeamResultsTableProps): JSX.Element {
  const rounds = useMemo(() => [...Array(totalRounds)].map((_, idx) => idx), [totalRounds]);
  const gridTemplate = useMemo(
    () => `minmax(170px, 1fr) repeat(${totalRounds}, minmax(72px, 1fr)) minmax(78px, 1fr)`,
    [totalRounds]
  );
  const rows = teams
    .map((team) => {
      const teamResults = results.filter((r) => r.teamId === team.id);
      if (teamResults.length === 0) return null;
      const total = teamResults.reduce((acc, r) => acc + r.result.points, 0);
      const roundTotals = rounds.map(
        (roundIdx) =>
          teamResults
            .filter((r) => r.roundIndex === roundIdx)
            .reduce((acc, r) => acc + r.result.points, 0)
      );
      return { team, teamResults, total, roundTotals };
    })
    .filter((row): row is { team: TeamEntry; teamResults: JumpResult[]; total: number; roundTotals: number[] } => row != null)
    .sort((a, b) => b.total - a.total);

  return (
    <div className="competition-screen__team-table">
      {rows.map((row, idx) => (
        <div key={row.team.id} className="competition-screen__team-row">
          <div className="competition-screen__team-main">
            <span className="competition-screen__team-pos">{idx + 1}.</span>
            <span className="competition-screen__team-flag">{countryToFlag(row.team.country)}</span>
            <span className="competition-screen__team-name">{teamLabel(row.team)}</span>
            <span className="competition-screen__team-total">{row.total.toFixed(1)} pkt</span>
          </div>
          <div className="competition-screen__team-rounds">
            {row.roundTotals.map((val, roundIdx) => (
              <span key={`${row.team.id}-r-${roundIdx}`} className="competition-screen__team-round-chip">
                R{roundIdx + 1}: {val > 0 ? val.toFixed(1) : '—'}
              </span>
            ))}
          </div>
          <div className="competition-screen__team-sub">
            <div
              className="competition-screen__team-subheader"
              style={{ gridTemplateColumns: gridTemplate }}
            >
              <span>Skoczek</span>
              {rounds.map((roundIdx) => (
                <span key={`${row.team.id}-h-${roundIdx}`} className="competition-screen__team-subheader-cell">
                  R{roundIdx + 1}
                </span>
              ))}
              <span className="competition-screen__team-subheader-cell">Suma</span>
            </div>
            {row.team.members.map((m) => {
              const jumperResults = row.teamResults.filter((r) => jumperId(r.jumper) === jumperId(m));
              const byRound = rounds.map((roundIdx) =>
                jumperResults.find((r) => r.roundIndex === roundIdx)
              );
              const total = byRound.reduce((acc, r) => acc + (r?.result.points ?? 0), 0);
              const lastResult = [...byRound].reverse().find(Boolean);
              const activeId = lastResult?.id ?? null;
              const isLast = Boolean(lastJumpId && lastJumpId === activeId);
              const isSelected = Boolean(selectedRowId && selectedRowId === activeId);
              return (
                <button
                  type="button"
                  key={jumperId(m)}
                  className={`competition-screen__team-subrow competition-screen__team-subrow--grid ${isLast ? 'competition-screen__row--last' : ''} ${isSelected ? 'competition-screen__row--selected' : ''}`}
                  style={{ gridTemplateColumns: gridTemplate }}
                  onClick={(e) =>
                    activeId &&
                    onSelectRow(activeId, { x: e.clientX + 12, y: e.clientY - 80 })
                  }
                  disabled={!activeId}
                >
                  <span className="competition-screen__team-subname">
                    <span className="competition-screen__flag">{countryToFlag(m.country)}</span>
                    {m.name} {m.surname}
                  </span>
                  {byRound.map((r, roundIdx) => (
                    <span
                      key={`${jumperId(m)}-${roundIdx}`}
                      className="competition-screen__team-subvalue"
                      title={r ? `${r.result.distance.toFixed(1)} m` : undefined}
                    >
                      {r ? r.result.points.toFixed(1) : '—'}
                    </span>
                  ))}
                  <span className="competition-screen__team-subtotal">
                    {total > 0 ? total.toFixed(1) : '—'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function BackIcon(): JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  );
}
