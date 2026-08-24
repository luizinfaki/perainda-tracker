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
  riotIdGameName: string;
  riotIdTagline: string;
  teamId: number; // 100 = azul, 200 = vermelho
  championName: string;
  kills: number;
  deaths: number;
  assists: number;
  win: boolean;
  gameEndedInEarlySurrender: boolean; // true = remake (rendição antes dos ~5min, não conta pra LP)
  teamPosition: string;
  champLevel: number;
  totalMinionsKilled: number;
  neutralMinionsKilled: number;
  totalDamageDealtToChampions: number;
  totalDamageTaken: number;
  totalHeal: number;
  goldEarned: number;
  visionScore: number;
  wardsPlaced: number;
  wardsKilled: number;
  doubleKills: number;
  tripleKills: number;
  quadraKills: number;
  pentaKills: number;
  item0: number;
  item1: number;
  item2: number;
  item3: number;
  item4: number;
  item5: number;
  item6: number;
  challenges?: {
    killParticipation?: number;
  };
}

export interface MatchDto {
  metadata: {
    matchId: string;
    participants: string[];
  };
  info: {
    gameCreation: number;
    gameEndTimestamp?: number;
    gameDuration: number;
    queueId: number;
    participants: MatchParticipant[];
  };
}

export interface ActiveGame {
  gameId: number;
  gameStartTime: number;
  gameQueueConfigId: number;
  participants: {
    puuid: string;
    riotId: string;
    teamId: number;
    championId: number;
  }[];
}
