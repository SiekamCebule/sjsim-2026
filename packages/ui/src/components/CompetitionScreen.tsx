import type { JSX } from 'react';
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
import {
  countryCodeToName,
  countryToFlag,
  getMenTeams,
  getWomenTeams,
  getWorldCupOrderAll,
  getWomenWorldCupOrderAll,
  type Jumper,
} from '../data/jumpersData';
import { getMixedNationsCupRanking, getMenNationsCupRanking } from '../data/nationsCup';
import type { GameConfigState } from './GameConfig';
import './competition-screen.css';

type RoundKind = 'training' | 'trial' | 'individual' | 'team_mixed' | 'team_men_pairs';

interface CompetitionScreenProps {
  event: ScheduleItem;
  config: GameConfigState | null;
  participating?: Jumper[];
  teamLineups?: Record<string, Jumper[]>;
  autoBar?: boolean;
  autoJumpIntervalMs?: number;
  weather?: NextEventWeather;
  onExit: (params?: { aborted?: boolean }) => void;
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
  wind: Wind;
  result: CoreJumpResult;
  styleNotes: number[] | null;
}

interface TeamEntry {
  id: string;
  country: string;
  members: Jumper[];
  simMembers: SimulationJumper[];
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

function roundKindFromEvent(event: ScheduleItem): RoundKind {
  if (event.type === 'trial' && event.gender === 'mixed') return 'team_mixed';
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

function buildTeamPairs(teamLineups?: Record<string, Jumper[]>): TeamEntry[] {
  const men = getMenTeams();
  const byCountry = new Map<string, Jumper[]>();
  men.forEach((j) => {
    const list = byCountry.get(j.country) ?? [];
    list.push(j);
    byCountry.set(j.country, list);
  });
  const teams: TeamEntry[] = [];
  [...byCountry.entries()].forEach(([country, list]) => {
    const override = teamLineups?.[country];
    const members = override && override.length >= 2 ? [override[0]!, override[1]!] : [list[0]!, list[1]!];
    if (members.length >= 2) {
      teams.push({
        id: country,
        country,
        members,
        simMembers: [toSimulationJumper(members[0]!), toSimulationJumper(members[1]!)],
      });
    }
  });
  teams.sort((a, b) => a.country.localeCompare(b.country));
  return teams;
}

function buildMixedTeams(teamLineups?: Record<string, Jumper[]>): TeamEntry[] {
  const men = getMenTeams();
  const women = getWomenTeams();
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
  const teams: TeamEntry[] = [];
  [...menByCountry.keys()].forEach((country) => {
    const menList = menByCountry.get(country) ?? [];
    const womenList = womenByCountry.get(country) ?? [];
    const override = teamLineups?.[country];
    const hasOverride = override && override.length >= 4;
    const members = hasOverride
      ? [override![0]!, override![1]!, override![2]!, override![3]!]
      : [womenList[0]!, menList[0]!, womenList[1]!, menList[1]!];
    if (members.length >= 4) {
      teams.push({
        id: country,
        country,
        members,
        simMembers: [
          toSimulationJumper(members[0]!),
          toSimulationJumper(members[1]!),
          toSimulationJumper(members[2]!),
          toSimulationJumper(members[3]!),
        ],
      });
    }
  });
  teams.sort((a, b) => a.country.localeCompare(b.country));
  return teams;
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

function NextRoundGateHint({ gate }: { gate: number }): JSX.Element {
  return (
    <span className="competition-screen__gate-hint">
      Belka {gate}
    </span>
  );
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

export const CompetitionScreen = ({
  event,
  config,
  participating,
  teamLineups,
  autoBar = true,
  autoJumpIntervalMs = 5000,
  weather,
  onExit,
}: CompetitionScreenProps): JSX.Element => {
  const kind = roundKindFromEvent(event);
  const isDirector = config?.mode === 'director';
  const includeStyle = event.type !== 'training' && event.type !== 'trial';

  const random = useMemo(() => createDefaultRandom(), [event.id]);
  const simulator = useMemo(() => new SimpleJumpSimulator(SIMULATOR_CONFIG, random), [random]);
  const baseWind = useMemo(() => windBaseFromWeather(weather), [weather]);
  const windProvider = useMemo(
    () => windEngine({ baseAverage: baseWind.average, windVariability: baseWind.instability }, random),
    [baseWind.average, baseWind.instability, random]
  );
  const hill = useMemo(() => hillData(event.hill), [event.hill]);

  const individualRoster = useMemo(() => {
    if (participating && participating.length > 0) return participating;
    if (event.gender === 'women') return getWomenTeams();
    if (event.gender === 'men') {
      const callups = Object.values(config?.allCallups ?? {}).flat();
      return callups.length > 0 ? callups : getMenTeams();
    }
    return [];
  }, [event.gender, participating, config?.allCallups]);

  const teamPairs = useMemo(() => (kind === 'team_men_pairs' ? buildTeamPairs(teamLineups) : []), [kind, teamLineups]);
  const teamMixed = useMemo(() => (kind === 'team_mixed' ? buildMixedTeams(teamLineups) : []), [kind, teamLineups]);

  const totalRounds = event.type === 'individual' ? 2 : event.type === 'team_men_pairs' ? 3 : event.type === 'team_mixed' ? 2 : 1;

  const allSimJumpers = useMemo(() => {
    if (kind === 'team_men_pairs') return teamPairs.flatMap((t) => t.simMembers);
    if (kind === 'team_mixed') return teamMixed.flatMap((t) => t.simMembers);
    return individualRoster.map(toSimulationJumper);
  }, [kind, teamPairs, teamMixed, individualRoster]);

  const startGate = useMemo(() => {
    try {
      return selectStartingGate({
        simulator,
        windProvider,
        juryBravery: JuryBravery.Medium,
        jumpers: allSimJumpers,
        hill: { simulationData: { kPoint: hill.kPoint, realHs: hill.realHs, metersByGate: hill.metersByGate } },
      });
    } catch {
      return 15;
    }
  }, [simulator, windProvider, allSimJumpers, hill.kPoint, hill.realHs, hill.metersByGate]);

  const [roundIndex, setRoundIndex] = useState(0);
  const [queueIndex, setQueueIndex] = useState(0);
  const [queue, setQueue] = useState<JumpQueueItem[]>([]);
  const [results, setResults] = useState<JumpResult[]>([]);
  const [lastJumpId, setLastJumpId] = useState<string | null>(null);
  const [gateDelta, setGateDelta] = useState(0);
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
        ? [...getWorldCupOrderAll()].reverse()
        : event.gender === 'women'
          ? [...getWomenWorldCupOrderAll()].reverse()
          : [],
    [event.gender]
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
    const standings = buildTeamStandings(results, teams, nextRound - 1);
    const groupList: StartListEntry[] = [];
    for (let slot = 0; slot < 4; slot++) {
      groupList.push(
        ...getMixedGroupStartList(
          mixedTeams,
          standings,
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

  useEffect(() => {
    const newQueue = buildQueueForRound(roundIndex);
    setQueue(newQueue);
    setQueueIndex(0);
    setPendingWind(windProvider.getWind());
    setGateDelta(0);
  }, [roundIndex]);

  const currentItem = queue[queueIndex];

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
  }, [autoJump, autoJumpIntervalMs, queueIndex, roundIndex, gateDelta, pendingWind]);

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

  const effectiveGate = startGate + gateDelta;
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

  const windCompPoints = (wind: Wind): number => {
    // Wiatr z przodu (avg > 0) ma ODEJMOWAĆ punkty, wiatr w plecy (avg < 0) ma DODAWAĆ.
    if (wind.average >= 0) return -wind.average * hill.scoring.windHeadwindPerMs;
    return Math.abs(wind.average) * hill.scoring.windTailwindPerMs;
  };

  const valColorClass = (v: number, prefix: 'wind' | 'comp'): string =>
    `competition-screen__val competition-screen__val--${prefix}-${v > 0 ? 'pos' : v < 0 ? 'neg' : 'zero'}`;

  const distanceForTargetPoints = (targetPoints: number): number => {
    const windPoints = windCompPoints(pendingWind);
    const gatePoints = -gateDelta * hill.scoring.pointsPerGate;
    const stylePoints = includeStyle ? avgStylePoints : 0;
    const needed = targetPoints - windPoints - gatePoints - stylePoints;
    const distance = hill.kPoint + (needed - 60) / hill.scoring.pointsPerMeter;
    return roundDistance(distance);
  };

  const toBeatDistance = useMemo(() => {
    if (results.length === 0) return null;
    const target = Math.max(0, leaderTotal + 0.1 - currentTotalBefore);
    return distanceForTargetPoints(target);
  }, [results, leaderTotal, currentTotalBefore, pendingWind, gateDelta, avgStylePoints, includeStyle]);

  const toAdvanceDistance = useMemo(() => {
    if (kind === 'training' || kind === 'trial') return null;
    if (kind === 'individual' && roundIndex === 0) {
      const sorted = [...currentIndividualStandings].sort((a, b) => b.totalPoints - a.totalPoints);
      const cutoff = sorted[29]?.totalPoints ?? sorted[sorted.length - 1]?.totalPoints ?? 0;
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
  }, [kind, roundIndex, currentIndividualStandings, currentTeamStandings, currentTotalBefore, pendingWind, gateDelta, avgStylePoints, includeStyle]);

  const simulateJump = (item: JumpQueueItem, wind: Wind, currentGateDelta: number): { res: JumpResult; nextGateDelta: number } => {
    const simJumper = toSimulationJumper(item.jumper);
    const effectiveGate = startGate + currentGateDelta;
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
    const gatePoints = -currentGateDelta * hill.scoring.pointsPerGate;
    const stylePoints = includeStyle
      ? scoring.stylePoints({
        landing: jump.landing,
        distance,
        realHs: hill.realHs,
        kPoint: hill.kPoint,
        landingTendency: simJumper.skills.landingTendency,
        random,
      })
      : undefined;
    const points = Math.max(0, distancePoints + windPoints + gatePoints + (stylePoints ?? 0));
    const res: JumpResult = {
      id: item.id,
      roundIndex: item.roundIndex,
      bib: item.bib,
      jumper: item.jumper,
      teamId: item.teamId,
      slotInTeam: item.slotInTeam,
      gate: effectiveGate,
      gateDelta: currentGateDelta,
      wind,
      result: {
        distance,
        landing: jump.landing,
        points,
        gateDelta: currentGateDelta,
        wind,
        ...(stylePoints != null ? { stylePoints } : {}),
      },
      styleNotes: null,
    };
    const nextGateDelta = canAutoGate
      ? (() => {
        if (distance > hill.realHs + 2) return Math.max(-5, currentGateDelta - 1);
        if (distance < hill.kPoint - 4) return Math.min(5, currentGateDelta + 1);
        return currentGateDelta;
      })()
      : currentGateDelta;
    return { res, nextGateDelta };
  };

  const handleNextJump = (): void => {
    if (!currentItem || isRoundComplete) return;
    const { res, nextGateDelta } = simulateJump(currentItem, pendingWind, gateDelta);
    setResults((prev) => [...prev, res]);
    setLastJumpId(res.id);
    setQueueIndex((prev) => prev + 1);
    setPendingWind(windProvider.getWind());

    if (nextGateDelta !== gateDelta) {
      setGateDelta(nextGateDelta);
      setGateHighlight(true);
      setTimeout(() => setGateHighlight(false), 2500);
    }
  };

  const handleAutoSimulateRound = (): void => {
    if (isRoundComplete) return;
    setAutoJump(false);
    let currentWind = pendingWind;
    let currentGateDelta = gateDelta;
    let hadGateChange = false;
    const newResults: JumpResult[] = [];
    for (let i = queueIndex; i < queue.length; i += 1) {
      const item = queue[i]!;
      const { res, nextGateDelta } = simulateJump(item, currentWind, currentGateDelta);
      newResults.push(res);
      if (nextGateDelta !== currentGateDelta) hadGateChange = true;
      currentGateDelta = nextGateDelta;
      currentWind = windProvider.getWind();
    }
    if (newResults.length === 0) return;
    setResults((prev) => [...prev, ...newResults]);
    setLastJumpId(newResults[newResults.length - 1]!.id);
    setQueueIndex(queue.length);
    setGateDelta(currentGateDelta);
    setPendingWind(currentWind);
    if (hadGateChange) {
      setGateHighlight(true);
      setTimeout(() => setGateHighlight(false), 2500);
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

  const handleManualGateToggle = (): void => {
    if (manualGate) {
      setManualGate(false);
      return;
    }
    setShowManualGateDialog(true);
  };

  const adjustGate = (delta: number): void => {
    setGateDelta((prev) => Math.max(-5, Math.min(5, prev + delta)));
  };

  const confirmManualGate = (): void => {
    setManualGate(true);
    setShowManualGateDialog(false);
  };

  const rowDetails = useMemo(() => {
    if (!selectedRowId) return null;
    return results.find((r) => r.id === selectedRowId) ?? null;
  }, [selectedRowId, results]);

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

  const lastJumpInfo = useMemo(() => {
    if (!lastJumpId) return null;
    const jump = results.find((r) => r.id === lastJumpId);
    if (!jump) return null;
    if (hasTeams && jump.teamId) {
      const sorted = [...currentTeamStandings].sort((a, b) => b.totalPoints - a.totalPoints);
      const position = sorted.findIndex((s) => s.teamId === jump.teamId);
      return {
        label: teamLabel(teams.find((t) => t.id === jump.teamId)!),
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

      <header className="competition-screen__header">
        <button
          type="button"
          className="competition-screen__back"
          onClick={() => (isEventComplete ? onExit() : setShowExitDialog(true))}
          aria-label="Wróć"
        >
          <BackIcon />
        </button>
        <div className="competition-screen__title">
          <h1>{event.label}</h1>
          <span className={`competition-screen__gate-change ${gateHighlight ? 'competition-screen__gate-change--active' : ''}`}>
            Zmiana belki: {startGate + gateDelta}
          </span>
        </div>
        <div className="competition-screen__header-actions">
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
          <NextRoundGateHint gate={startGate + gateDelta} />
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
                    <strong className={valColorClass(-rowDetails.gateDelta * hill.scoring.pointsPerGate, 'comp')}>
                      {(-rowDetails.gateDelta * hill.scoring.pointsPerGate).toFixed(1)}
                    </strong>
                    {includeStyle && (
                      <>
                        <span>Noty</span>
                        <strong>{rowDetails.result.stylePoints != null ? rowDetails.result.stylePoints.toFixed(1) : '—'}</strong>
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
                <strong className={valColorClass(-lastJumpInfo.jump.gateDelta * hill.scoring.pointsPerGate, 'comp')}>
                  {(-lastJumpInfo.jump.gateDelta * hill.scoring.pointsPerGate).toFixed(1)}
                </strong>
                {includeStyle && (
                  <>
                    <span>Noty</span>
                    <strong>{lastJumpInfo.jump.result.stylePoints != null ? lastJumpInfo.jump.result.stylePoints.toFixed(1) : '—'}</strong>
                  </>
                )}
              </div>
            </div>
          )}

          <div className="competition-screen__actions">
            {!isEventComplete && (
              <>
                <label className="competition-screen__auto">
                  <input type="checkbox" checked={autoJump} onChange={(e) => setAutoJump(e.target.checked)} />
                  <span>Auto-skok</span>
                </label>
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
                <button type="button" className="competition-screen__btn competition-screen__btn--secondary" onClick={handleAutoSimulateClick} disabled={!currentItem || isRoundComplete}>
                  Pomiń skoki
                </button>
                <button type="button" className="competition-screen__btn competition-screen__btn--primary" onClick={handleNextJump} disabled={!currentItem}>
                  Następny skok
                </button>
                {isRoundComplete && (
                  <button type="button" className="competition-screen__btn competition-screen__btn--secondary" onClick={handleAdvanceRound}>
                    Przejdź do kolejnej serii
                  </button>
                )}
              </>
            )}
            {isEventComplete && (
              <button type="button" className="competition-screen__btn competition-screen__btn--highlight" onClick={() => onExit()}>
                Zakończ konkurs
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
              onClick={(e) =>
                activeId &&
                onSelectRow(activeId, { x: e.clientX + 12, y: e.clientY - 80 })
              }
            >
              <td>{idx + 1}</td>
              <td className="competition-screen__cell-name">
                <span className="competition-screen__flag">{countryToFlag(row.jumper.country)}</span>
                {row.jumper.name} {row.jumper.surname}
              </td>
              <td>{row.r1 ? `${row.r1.result.distance.toFixed(1)} m` : '—'}</td>
              <td>{row.r1 ? row.r1.result.points.toFixed(1) : '—'}</td>
              {totalRounds > 1 && (
                <>
                  <td>{row.r2 ? `${row.r2.result.distance.toFixed(1)} m` : '—'}</td>
                  <td>{row.r2 ? row.r2.result.points.toFixed(1) : '—'}</td>
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
}

function TeamResultsTable({
  teams,
  results,
  lastJumpId,
  selectedRowId,
  onSelectRow,
}: TeamResultsTableProps): JSX.Element {
  const rows = teams
    .map((team) => {
      const teamResults = results.filter((r) => r.teamId === team.id);
      if (teamResults.length === 0) return null;
      const total = teamResults.reduce((acc, r) => acc + r.result.points, 0);
      return { team, teamResults, total };
    })
    .filter((row): row is { team: TeamEntry; teamResults: JumpResult[]; total: number } => row != null)
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
          <div className="competition-screen__team-sub">
            {row.team.members
              .map((m) => {
                const jr = row.teamResults
                  .filter((r) => jumperId(r.jumper) === jumperId(m))
                  .sort((a, b) => b.roundIndex - a.roundIndex)[0];
                if (!jr) return null;
                const activeId = jr.id ?? null;
                const isLast = Boolean(lastJumpId && lastJumpId === activeId);
                const isSelected = Boolean(selectedRowId && selectedRowId === activeId);
                return (
                  <button
                    type="button"
                    key={jumperId(m)}
                    className={`competition-screen__team-subrow ${isLast ? 'competition-screen__row--last' : ''} ${isSelected ? 'competition-screen__row--selected' : ''}`}
                    onClick={(e) =>
                      activeId &&
                      onSelectRow(activeId, { x: e.clientX + 12, y: e.clientY - 80 })
                    }
                  >
                    <span className="competition-screen__flag">{countryToFlag(m.country)}</span>
                    <span>{m.name} {m.surname}</span>
                    <span className="competition-screen__team-subvalue">
                      {`${jr.result.distance.toFixed(1)} m · ${jr.result.points.toFixed(1)}`}
                    </span>
                  </button>
                );
              })
              .filter(Boolean)}
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
