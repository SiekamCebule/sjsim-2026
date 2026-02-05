/**
 * Logika konkursów: rozgrywanie bez UI (Sapporo, Predazzo).
 * Belka i wiatr z zewnątrz (IGatePolicy, IWindProvider) – brak tight couplingu.
 */

export { runEvent, type RunEventDeps } from './runEvent';
export {
  buildIndividualStartList,
  buildDuetStartList,
  buildMixedTeamStartList,
  buildTeamTrialStartList,
} from './startList';
export {
  distancePoints,
  gatePoints,
  windPoints,
  stylePoints,
  styleNotes,
  hasStylePoints,
  type StylePointsContext,
  type StyleNotesResult,
} from './scoring';
export * as scoring from './scoring';
export { HILL_PARAMS } from './hillParams';
export {
  fixedWindProvider,
  fixedGatePolicy,
  constantGatePolicy,
} from './mocks';
export { windEngine, type WindEngineParams } from './windEngine';
export {
  runSapporoWeekend,
  type SapporoWeekendResult,
  type SapporoStep,
  type SapporoSingleSeriesStep,
  type SapporoTwoSeriesStep,
  type RunSapporoWeekendParams,
} from './sapporoWeekend';
export {
  selectStartingGate,
  JuryBravery,
  MaxTriesExceededError,
} from './startingGate';
export type { IGatePolicy, GatePolicyState } from './IGatePolicy';
export type { IWindProvider } from './IWindProvider';
export type {
  EventKind,
  EventResult,
  EventInput,
  EventInputBase,
  IndividualEventInput,
  DuetEventInput,
  MixedTeamEventInput,
  TeamTrialEventInput,
  JumpResult,
  SeriesResult,
  SeriesJumpEntry,
  StartListEntry,
  IndividualStanding,
  DuetTeam,
  MixedTeam,
  TeamStanding,
  TeamStandingAfterSeries,
  HillScoringParams,
  IndividualEventResult,
  DuetEventResult,
  MixedTeamEventResult,
  TrainingOrTrialResult,
  QualificationResult,
} from './types';
export {
  buildIndividualRound1StartList,
  buildIndividualRoundNStartList,
  buildDuetRound1StartList,
  getDuetGroupStartList,
  buildMixedRound1StartList,
  getMixedGroupStartList,
  type IndividualEntry,
} from './order';
