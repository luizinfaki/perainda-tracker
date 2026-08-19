import { platformUrl, regionalUrl } from "./config";
import { riotRequest, RiotNotFoundError } from "./client";
import { RiotAccount, Summoner, LeagueEntry, MatchDto, ActiveGame } from "./types";

export function getAccountByRiotId(gameName: string, tagLine: string): Promise<RiotAccount> {
  const path = `/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;
  return riotRequest<RiotAccount>(regionalUrl(path));
}

export function getSummonerByPuuid(puuid: string): Promise<Summoner> {
  const path = `/lol/summoner/v4/summoners/by-puuid/${puuid}`;
  return riotRequest<Summoner>(platformUrl(path));
}

export function getLeagueEntriesByPuuid(puuid: string): Promise<LeagueEntry[]> {
  const path = `/lol/league/v4/entries/by-puuid/${puuid}`;
  return riotRequest<LeagueEntry[]>(platformUrl(path));
}

export interface MatchIdsFilter {
  count?: number; // default 20, máximo 100
  queue?: number; // ex: 420 = Ranked Solo/Duo, 440 = Ranked Flex, 450 = ARAM
  startTime?: number; // epoch em segundos — só partidas jogadas a partir daqui
}

export function getMatchIdsByPuuid(puuid: string, filter: MatchIdsFilter = {}): Promise<string[]> {
  const params = new URLSearchParams();
  params.set("count", String(filter.count ?? 20));
  if (filter.queue !== undefined) params.set("queue", String(filter.queue));
  if (filter.startTime !== undefined) params.set("startTime", String(filter.startTime));

  const path = `/lol/match/v5/matches/by-puuid/${puuid}/ids?${params.toString()}`;
  return riotRequest<string[]>(regionalUrl(path));
}

export function getMatchById(matchId: string): Promise<MatchDto> {
  const path = `/lol/match/v5/matches/${matchId}`;
  return riotRequest<MatchDto>(regionalUrl(path));
}

/** Retorna null quando o player não está em partida (404 é esperado, não é erro). */
export async function getActiveGameByPuuid(puuid: string): Promise<ActiveGame | null> {
  const path = `/lol/spectator/v5/active-games/by-summoner/${puuid}`;
  try {
    return await riotRequest<ActiveGame>(platformUrl(path));
  } catch (err) {
    if (err instanceof RiotNotFoundError) {
      return null;
    }
    throw err;
  }
}
