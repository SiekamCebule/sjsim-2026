/**
 * Harmonogram skoków w Predazzo (zgodny z SKI_JUMPING_SCHEDULE.md).
 * Używany w dashboardzie: następny event, lista po lewej, interpolacja treningów.
 */

export type EventGender = 'men' | 'women' | 'mixed';
export type EventType =
  | 'training'
  | 'trial'
  | 'individual'
  | 'team_mixed'
  | 'team_men_pairs';

export interface ScheduleItem {
  id: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  type: EventType;
  hill: 'HS107' | 'HS141';
  gender: EventGender;
  label: string; // np. "III trening mężczyzn (HS107)"
  /** Uściślenie rodzaju serii próbnej (np. duety). */
  trialKind?: 'team_men_pairs' | 'team_mixed';
  /** Liczba serii treningowych (1–3); tylko dla type === 'training' */
  trainingSeries?: number;
  /** Czy to konkurs główny (do pogrubienia w harmonogramie) */
  isMainCompetition: boolean;
}

const EXPERIMENTAL_SJSIM = typeof __EXPERIMENTAL_SJSIM__ !== 'undefined' && __EXPERIMENTAL_SJSIM__;

/** Pełna lista wydarzeń w kolejności chronologicznej. */
const PREDAZZO_SCHEDULE_FULL: ScheduleItem[] = [
  { id: '1', date: '2026-02-05', time: '17:00', type: 'training', hill: 'HS107', gender: 'women', label: 'Oficjalny trening kobiet (HS107)', trainingSeries: 3, isMainCompetition: false },
  { id: '2', date: '2026-02-05', time: '20:00', type: 'training', hill: 'HS107', gender: 'men', label: 'Oficjalny trening mężczyzn (HS107)', trainingSeries: 3, isMainCompetition: false },
  { id: '3', date: '2026-02-06', time: '09:00', type: 'training', hill: 'HS107', gender: 'women', label: 'Oficjalny trening kobiet (HS107)', trainingSeries: 3, isMainCompetition: false },
  { id: '4', date: '2026-02-07', time: '17:45', type: 'trial', hill: 'HS107', gender: 'women', label: 'Seria próbna kobiet (HS107)', isMainCompetition: false },
  { id: '5', date: '2026-02-07', time: '18:45', type: 'individual', hill: 'HS107', gender: 'women', label: 'Konkurs indywidualny kobiet (HS107)', isMainCompetition: true },
  { id: '6', date: '2026-02-08', time: '16:30', type: 'training', hill: 'HS107', gender: 'women', label: 'Oficjalny trening kobiet (HS107)', trainingSeries: 3, isMainCompetition: false },
  { id: '7', date: '2026-02-08', time: '19:00', type: 'training', hill: 'HS107', gender: 'men', label: 'Oficjalny trening mężczyzn (HS107)', trainingSeries: 3, isMainCompetition: false },
  { id: '8', date: '2026-02-09', time: '18:00', type: 'trial', hill: 'HS107', gender: 'men', label: 'Seria próbna mężczyzn (HS107)', isMainCompetition: false },
  { id: '9', date: '2026-02-09', time: '19:00', type: 'individual', hill: 'HS107', gender: 'men', label: 'Konkurs indywidualny mężczyzn (HS107)', isMainCompetition: true },
  { id: '10', date: '2026-02-10', time: '17:30', type: 'trial', hill: 'HS107', gender: 'mixed', label: 'Seria próbna drużyn mieszanych (HS107)', isMainCompetition: false },
  { id: '11', date: '2026-02-10', time: '18:45', type: 'team_mixed', hill: 'HS107', gender: 'mixed', label: 'Konkurs drużyn mieszanych (HS107)', isMainCompetition: true },
  { id: '12', date: '2026-02-12', time: '17:00', type: 'training', hill: 'HS141', gender: 'women', label: 'Oficjalny trening kobiet (HS141)', trainingSeries: 3, isMainCompetition: false },
  { id: '13', date: '2026-02-12', time: '20:00', type: 'training', hill: 'HS141', gender: 'men', label: 'Oficjalny trening mężczyzn (HS141)', trainingSeries: 3, isMainCompetition: false },
  { id: '14', date: '2026-02-13', time: '18:30', type: 'training', hill: 'HS141', gender: 'men', label: 'Oficjalny trening mężczyzn (HS141)', trainingSeries: 3, isMainCompetition: false },
  { id: '15', date: '2026-02-14', time: '09:00', type: 'training', hill: 'HS141', gender: 'women', label: 'Oficjalny trening kobiet (HS141)', trainingSeries: 3, isMainCompetition: false },
  { id: '16', date: '2026-02-14', time: '17:30', type: 'trial', hill: 'HS141', gender: 'men', label: 'Seria próbna mężczyzn (HS141)', trainingSeries: 3, isMainCompetition: false },
  { id: '17', date: '2026-02-14', time: '18:45', type: 'individual', hill: 'HS141', gender: 'men', label: 'Konkurs indywidualny mężczyzn (HS141)', isMainCompetition: true },
  { id: '18', date: '2026-02-15', time: '11:30', type: 'training', hill: 'HS141', gender: 'men', label: 'Oficjalny trening mężczyzn (HS141)', trainingSeries: 3, isMainCompetition: false },
  { id: '19', date: '2026-02-15', time: '17:30', type: 'trial', hill: 'HS141', gender: 'women', label: 'Seria próbna kobiet (HS141)', isMainCompetition: false },
  { id: '20', date: '2026-02-15', time: '18:45', type: 'individual', hill: 'HS141', gender: 'women', label: 'Konkurs indywidualny kobiet (HS141)', isMainCompetition: true },
  { id: '21', date: '2026-02-16', time: '18:00', type: 'trial', hill: 'HS141', gender: 'men', label: 'Seria próbna duetów mężczyzn (HS141)', trialKind: 'team_men_pairs', isMainCompetition: false },
  { id: '22', date: '2026-02-16', time: '19:00', type: 'team_men_pairs', hill: 'HS141', gender: 'men', label: 'Konkurs duetów mężczyzn (HS141)', isMainCompetition: true },
];

const EXPERIMENTAL_EVENT_IDS = new Set(['9', '10', '11', '17', '21', '22']);

export const PREDAZZO_SCHEDULE: ScheduleItem[] = EXPERIMENTAL_SJSIM
  ? PREDAZZO_SCHEDULE_FULL.filter((item) => EXPERIMENTAL_EVENT_IDS.has(item.id))
  : PREDAZZO_SCHEDULE_FULL;

export type WeatherCondition =
  | 'sunny'
  | 'partly_cloudy'
  | 'cloudy'
  | 'rainy'
  | 'rainy_sunny'
  | 'snowy'
  | 'snowy_sunny'
  | 'thunder'
  | 'night';

export interface NextEventWeather {
  condition: WeatherCondition;
  tempC: number;
  windMs: number; // ujemny = wiatr w plecy, dodatni = pod narty
  /**
   * Zmienność wiatru 0–1. W silniku (windEngine): przy każdym skoku wiatr = windMs + N(0, σ),
   * gdzie σ = windVariability * 2 (min 0.1). Np. 0.25 → σ≈0.5 m/s (wiatr prawie stały),
   * 0.5 → σ≈1 m/s (~95% skoków w windMs±2 m/s), 1 → σ=2 (duża loteryjność).
   * W symulatorze skoku wyższa zmienność też zwiększa rozrzut wpływu wiatru na odległość.
   */
  windVariability: number;
}

interface DailyWeatherMock {
  date: string; // YYYY-MM-DD
  maxC: number;
  minC: number;
  condition: WeatherCondition;
}

interface TrainingSeriesWeatherOverride {
  condition: WeatherCondition;
  tempC?: number;
  windMs?: number;
  windVariability?: number;
}

/** Pogoda dzienna (fallback dla eventów bez override). Zgodna z TRAINING_SERIES_WEATHER na dni z treningami. */
const MOCK_DAILY_WEATHER: DailyWeatherMock[] = [
  { date: '2026-02-05', maxC: 6, minC: 2, condition: 'snowy' },           // treningi 1, 2
  { date: '2026-02-06', maxC: 7, minC: 2, condition: 'partly_cloudy' },  // trening 3
  { date: '2026-02-07', maxC: 7, minC: 0, condition: 'rainy_sunny' },
  { date: '2026-02-08', maxC: 6, minC: -2, condition: 'cloudy' },        // treningi 6, 7
  { date: '2026-02-09', maxC: 5, minC: 0, condition: 'snowy_sunny' },
  { date: '2026-02-10', maxC: 6, minC: 0, condition: 'partly_cloudy' },
  { date: '2026-02-11', maxC: 6, minC: -1, condition: 'cloudy' },
  { date: '2026-02-12', maxC: 7, minC: -2, condition: 'partly_cloudy' },  // treningi 12, 13
  { date: '2026-02-13', maxC: 6, minC: 0, condition: 'rainy' },           // trening 14
  { date: '2026-02-14', maxC: 5, minC: -5, condition: 'snowy' },         // trening 15
  { date: '2026-02-15', maxC: 5, minC: -5, condition: 'cloudy' },        // trening 18
  { date: '2026-02-16', maxC: 5, minC: -4, condition: 'partly_cloudy' },
  { date: '2026-02-17', maxC: 4, minC: -4, condition: 'snowy_sunny' },
  { date: '2026-02-18', maxC: 5, minC: -4, condition: 'snowy_sunny' },
];

/** Pogoda per seria treningowa (1/2/3) — ustawienia do ręcznej edycji. */
const TRAINING_SERIES_WEATHER: Record<string, TrainingSeriesWeatherOverride[]> = {
  '1': [
    { condition: 'snowy', tempC: 1, windMs: -1, windVariability: 0.092 },
    { condition: 'snowy', tempC: 2, windMs: -1.08, windVariability: 0.0984 },
    { condition: 'snowy', tempC: 1, windMs: -1.5, windVariability: 0.0784 },
  ],
  '2': [
    { condition: 'snowy', tempC: 2, windMs: -1.78, windVariability: 0.092 },
    { condition: 'cloudy', tempC: 3, windMs: -1.9, windVariability: 0.1112 },
    { condition: 'cloudy', tempC: 3, windMs: -1.94, windVariability: 0.072 },
  ],
  '3': [
    { condition: 'partly_cloudy', tempC: 2, windMs: -0.2, windVariability: 0.1048 },
    { condition: 'sunny', tempC: 7, windMs: 0.5, windVariability: 0.1624 },
    { condition: 'sunny', tempC: 8, windMs: 0.3, windVariability: 0.164 },
  ],
  '6': [
    { condition: 'partly_cloudy', tempC: -2, windMs: -0.7, windVariability: 0.148 },
    { condition: 'cloudy', tempC: -1, windMs: -0.4, windVariability: 0.1248 },
    { condition: 'cloudy', tempC: -3, windMs: -0.2, windVariability: 0.036 },
  ],
  '7': [
    { condition: 'cloudy', tempC: -2, windMs: -0.5, windVariability: 0.036 },
    { condition: 'cloudy', tempC: -3, windMs: -1.3, windVariability: 0.056 },
    { condition: 'cloudy', tempC: -3, windMs: -2.3, windVariability: 0.1312 },
  ],
  '12': [
    { condition: 'partly_cloudy', tempC: -1, windMs: 0.2, windVariability: 0.0368 },
    { condition: 'cloudy', tempC: 0, windMs: -0.4, windVariability: 0.1312 },
    { condition: 'cloudy', tempC: -1, windMs: -0.7, windVariability: 0.0984 },
  ],
  '13': [
    { condition: 'cloudy', tempC: -1, windMs: -0.9, windVariability: 0.164 },
    { condition: 'cloudy', tempC: -2, windMs: -0.4, windVariability: 0.0952 },
    { condition: 'cloudy', tempC: -1, windMs: -1.1, windVariability: 0.0824 },
  ],
  '14': [
    { condition: 'rainy', tempC: 2, windMs: 0.6, windVariability: 0.2296 },
    { condition: 'rainy', tempC: 3, windMs: 0.1, windVariability: 0.108 },
    { condition: 'cloudy', tempC: 0, windMs: 0.4, windVariability: 0.1808 },
  ],
  '15': [
    { condition: 'cloudy', tempC: -4, windMs: -2.1, windVariability: 0.0984 },
    { condition: 'snowy', tempC: -5, windMs: -2.4, windVariability: 0.1152 },
    { condition: 'snowy', tempC: -3, windMs: -2.1, windVariability: 0.1968 },
  ],
  '18': [
    { condition: 'cloudy', tempC: -7, windMs: -0.7, windVariability: 0.0688 },
    { condition: 'cloudy', tempC: -3, windMs: -0.3, windVariability: 0.0888 },
    { condition: 'cloudy', tempC: -3, windMs: 0.5, windVariability: 0.2296 },
  ],
};


const WEATHER_CONDITION_LABELS: Record<WeatherCondition, string> = {
  sunny: 'słonecznie',
  partly_cloudy: 'częściowe zachmurzenie',
  cloudy: 'pochmurnie',
  rainy: 'deszcz',
  rainy_sunny: 'deszcz i słońce',
  snowy: 'śnieg',
  snowy_sunny: 'śnieg i słońce',
  thunder: 'burza',
  night: 'noc',
};

const DEFAULT_WIND: Pick<NextEventWeather, 'windMs' | 'windVariability'> = {
  windMs: 1.2,
  windVariability: 0.144,
};

/** Szablon wiatru per typ eventu (dla treningów i fallbacku). */
const WIND_BY_EVENT_TYPE: Record<EventType, Pick<NextEventWeather, 'windMs' | 'windVariability'>> = {
  training: { windMs: 0.6, windVariability: 0.185 },
  trial: { windMs: 0.9, windVariability: 0.164 },
  individual: { windMs: 1.3, windVariability: 0.123 },
  team_mixed: { windMs: -0.4, windVariability: 0.144 },
  team_men_pairs: { windMs: 0.2, windVariability: 0.156 },
};

/**
 * Wiatry per event (tylko nie-treningi). Dla treningów wiatr bierze się wyłącznie
 * z TRAINING_SERIES_WEATHER (osobno dla serii I/II/III), żeby nie dublować konfiguracji.
 */
const WIND_BY_EVENT_ID: Record<
  string,
  Pick<NextEventWeather, 'windMs' | 'windVariability'>
> = {
  '4': { windMs: -1.7, windVariability: 0.1312 },
  '5': { windMs: -1.87, windVariability: 0.1344 },
  '8': { windMs: -1.5, windVariability: 0.1248 },
  '9': { windMs: -1.5, windVariability: 0.1152 },
  '10': { windMs: -0.2, windVariability: 0.2032 },
  '11': { windMs: -0.2, windVariability: 0.2296 },
  '16': { windMs: -2.1, windVariability: 0.184 },
  '17': { windMs: -2.2, windVariability: 0.1808 },
  '19': { windMs: 0.22, windVariability: 0.1312 },
  '20': { windMs: 0.1, windVariability: 0.1968 },
  '21': { windMs: 0.5, windVariability: 0.112 },
  '22': { windMs: 0.4, windVariability: 0.1184 },
};


export function getWeatherConditionLabel(condition: WeatherCondition): string {
  return WEATHER_CONDITION_LABELS[condition] ?? WEATHER_CONDITION_LABELS.cloudy;
}

export function isSnowyCondition(condition: WeatherCondition): boolean {
  return condition === 'snowy' || condition === 'snowy_sunny';
}

/** Zwraca następny event (symulacja: teraz = 2026-02-05 16:00, więc następny to 17:00 trening kobiet). */
export function getNextEvent(now?: Date, schedule: ScheduleItem[] = PREDAZZO_SCHEDULE): ScheduleItem | null {
  const t = now ?? new Date();
  const today = t.toISOString().slice(0, 10);
  const timeStr = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
  for (const item of schedule) {
    if (item.date > today) return item;
    if (item.date === today && item.time >= timeStr) return item;
  }
  return null;
}

/** Czy event jest w przeszłości (do wyszarzenia). */
export function isEventPast(item: ScheduleItem, now?: Date): boolean {
  const t = now ?? new Date();
  const today = t.toISOString().slice(0, 10);
  const timeStr = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
  if (item.date < today) return true;
  if (item.date === today && item.time < timeStr) return true;
  return false;
}

/** Czy event jest ukończony wg postępu rozgrywki. */
export function isEventCompleted(
  item: ScheduleItem,
  completedIds: string[],
  trainingBlockProgress: Record<string, number>
): boolean {
  if (completedIds.includes(item.id)) return true;
  if (item.type === 'training' && (item.trainingSeries ?? 0) >= 2) {
    const done = trainingBlockProgress[item.id] ?? 0;
    return done >= (item.trainingSeries ?? 0);
  }
  return false;
}

/** Następny event wg postępu (pomija ukończone). */
export function getNextEventByProgress(
  completedIds: string[],
  trainingBlockProgress: Record<string, number>,
  schedule: ScheduleItem[] = PREDAZZO_SCHEDULE
): ScheduleItem | null {
  for (const item of schedule) {
    if (isEventCompleted(item, completedIds, trainingBlockProgress)) continue;
    return item;
  }
  return null;
}

/** Pogoda placeholder dla następnego eventu (później z symulacji). */
function pickEventTemp(day: DailyWeatherMock, time?: string): number {
  if (!time) return Math.round((day.minC + day.maxC) / 2);
  const hour = Number(time.split(':')[0]);
  if (Number.isNaN(hour)) return Math.round((day.minC + day.maxC) / 2);
  if (hour <= 10) return day.minC;
  if (hour <= 15) return Math.round((day.minC + day.maxC) / 2);
  return day.maxC;
}

function getDailyWeather(date: string): DailyWeatherMock | null {
  return MOCK_DAILY_WEATHER.find((day) => day.date === date) ?? null;
}

function getTrainingSeriesIndex(
  event: ScheduleItem,
  trainingBlockProgress?: Record<string, number>
): number | null {
  if (event.type !== 'training' || (event.trainingSeries ?? 0) < 2) return null;
  const done = trainingBlockProgress?.[event.id] ?? 0;
  const seriesCount = Math.max(1, event.trainingSeries ?? 1);
  return Math.min(Math.max(0, done), seriesCount - 1);
}

/** Pogoda placeholder dla eventu (zgodna ze screenem pogody). */
export function getNextEventWeather(
  event?: ScheduleItem | null,
  trainingBlockProgress?: Record<string, number>,
  schedule: ScheduleItem[] = PREDAZZO_SCHEDULE
): NextEventWeather {
  const target = event ?? getNextEvent(undefined, schedule);
  if (!target) {
    return {
      condition: 'cloudy',
      tempC: 0,
      ...DEFAULT_WIND,
    };
  }
  const day = getDailyWeather(target.date);
  if (!day) {
    return {
      condition: 'cloudy',
      tempC: 0,
      ...DEFAULT_WIND,
    };
  }
  const seriesIndex = getTrainingSeriesIndex(target, trainingBlockProgress);
  const seriesOverrides = seriesIndex != null ? TRAINING_SERIES_WEATHER[target.id] : null;
  const override = seriesIndex != null ? (seriesOverrides?.[seriesIndex] ?? null) : null;
  const baseWind = WIND_BY_EVENT_ID[target.id] ?? WIND_BY_EVENT_TYPE[target.type] ?? DEFAULT_WIND;
  const wind = {
    windMs: override?.windMs ?? baseWind.windMs,
    windVariability: override?.windVariability ?? baseWind.windVariability,
  };
  return {
    condition: override?.condition ?? day.condition,
    tempC: override?.tempC ?? pickEventTemp(day, target.time),
    ...wind,
  };
}

function windSpeedLabel(speed: number): string {
  const abs = Math.abs(speed);
  const dir = speed < 0 ? 'w plecy' : 'pod narty';
  return `${abs.toFixed(1)} m/s ${dir}`;
}

/** Prognoza wiatru: kierunek, siła i loteryjność — jedna ładna informacja. */
export function getFullWindForecast(weather: NextEventWeather): string {
  const speed = windSpeedLabel(weather.windMs);
  const v = weather.windVariability;
  const lottery =
    v <= 0.2 ? 'mała loteryjność' :
      v <= 0.45 ? 'umiarkowana loteryjność' :
        v <= 0.7 ? 'spora loteryjność' : 'bardzo loteryjne warunki';
  return `${speed} · ${lottery}`;
}

/**
 * Z harmonogramu (SKI_JUMPING_SCHEDULE.md): które eventy mają „niektórzy odpuszczą”.
 * Służy do szkieletu algorytmu wyboru startu w treningach/seriach próbnych.
 */
export const EVENT_SKIP_HINTS: Record<string, 'few' | 'many' | 'most'> = {
  '6': 'most',   // 16:30 trening kobiet HS107 — większość nie skacze
  '7': 'few',    // 19:00 trening mężczyzn HS107 — niektórzy odpuszczą
  '14': 'few',   // 18:30 trening mężczyzn HS141
  '15': 'few',   // 09:00 trening kobiet HS141
  '18': 'most',  // 11:30 trening mężczyzn HS141 — większość nie skacze
};
