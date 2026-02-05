export interface JumperEventStanding {
  jumperId: string;
  country: string;
  totalPoints: number;
  rank: number;
  rounds: number[];
}

export interface TeamEventStanding {
  teamId: string;
  country: string;
  totalPoints: number;
  rank: number;
}

export interface EventResultsSummary {
  eventId: string;
  type: 'training' | 'trial' | 'individual' | 'team_mixed' | 'team_men_pairs';
  gender: 'men' | 'women' | 'mixed';
  hill: 'HS107' | 'HS141';
  standings: JumperEventStanding[];
  teamStandings?: TeamEventStanding[];
}
