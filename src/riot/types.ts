export interface RiotAccount {
  puuid: string;
  gameName: string;
  tagLine: string;
}

export interface Summoner {
  // Summoner-V4 não retorna mais `id`/`accountId` (encryptedSummonerId foi descontinuado pela Riot) — puuid é a chave.
  puuid: string;
  profileIconId: number;
  revisionDate: number;
  summonerLevel: number;
}

export interface LeagueEntry {
  queueType: string;
  tier: string;
  rank: string;
  puuid: string;
  leaguePoints: number;
  wins: number;
  losses: number;
}

export interface MatchParticipant {
  puuid: string;
  championName: string;
  kills: number;
  deaths: number;
  assists: number;
  win: boolean;
}

export interface MatchDto {
  metadata: {
    matchId: string;
    participants: string[];
  };
  info: {
    gameCreation: number;
    gameEndTimestamp?: number;
    participants: MatchParticipant[];
  };
}

export interface ActiveGame {
  gameId: number;
  gameStartTime: number;
  participants: {
    puuid?: string;
    summonerId?: string;
    championId: number;
  }[];
}
