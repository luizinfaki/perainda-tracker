# Perainda Tracker — Plano de Desenvolvimento

Projeto pessoal, sem frontend por enquanto. Objetivo: ter o serviço de coleta rodando localmente, cadastrando players via script/seed e mandando notificações no Discord.

Referência de arquitetura/schema: `CLAUDE.MD`.

## Fase 0 — Setup do Projeto
- [x] Iniciar repositório git.
- [x] `npm init` + TypeScript (`tsconfig.json`, `tsx` pra rodar em dev).
- [x] Estrutura de pastas: `src/riot/` (client da Riot API), `src/db/`, `src/jobs/`, `src/notifications/`.
- [x] `.env` + `.env.example` (`RIOT_API_KEY`, `DATABASE_URL`, `DISCORD_WEBHOOK_URL`).
- [x] Instalar Prisma (fixado em v6 — a v7 exige `prisma.config.ts` com driver adapter, complexidade desnecessária aqui), criar `schema.prisma` com os models de `CLAUDE.MD` (Player, Match, RankSnapshot, NotificationEvent).
- [x] `docker-compose.yml` criado (documentado, ainda não usado — Docker não instalado nesta máquina). Banco local rodando via **Postgres 18 nativo já instalado no Windows**; migration inicial (`init`) aplicada com sucesso contra ele.

## Fase 1 — Cliente da Riot API
- [x] Função base de request (header `X-Riot-Token`, tratamento de `404` e `429` com `Retry-After`). `src/riot/client.ts`.
- [x] Rate limiter simples (fila com delay entre requests, respeitando os limites da dev key). `src/riot/rateLimiter.ts`.
- [x] Wrapper `getAccountByRiotId(gameName, tagLine)` — regional routing.
- [x] Wrapper `getSummonerByPuuid(puuid)` — platform routing (dados complementares, opcional).
- [x] Wrapper `getLeagueEntriesByPuuid(puuid)` — **descoberto durante o teste manual que a Riot descontinuou `encryptedSummonerId`; o endpoint correto hoje é `by-puuid`, não `by-summoner`** (`CLAUDE.MD` seção 3 e 5 atualizados, migration `drop_summoner_id` aplicada).
- [x] Wrapper `getMatchIdsByPuuid(puuid)`.
- [x] Wrapper `getMatchById(matchId)`.
- [x] Wrapper `getActiveGameByPuuid(puuid)` (spectator; `404` = não está em partida, não é erro).
- [x] Testado manualmente contra a API real (`src/riot/manual-test.ts`, conta Srprepucio#666) — os 6 wrappers funcionando ponta a ponta.

## Fase 2 — Cadastro de Players
- [x] Script CLI `src/scripts/register-player.ts`: recebe `gameName#tagLine` (e opcionalmente `REALTIME`/`DAILY_SUMMARY`), busca PUUID via Account-V1 e rank via League-V4 (`by-puuid`), faz upsert do `Player` e cria o `RankSnapshot` inicial (baseline, `lpChange`/`lpBalance` = 0) na primeira vez. Idempotente — rodar de novo não duplica player nem snapshot.
- [x] Cadastrar os players do grupo: Srprepucio#666, Trakinas2202#BR1, Perainda Aura#DAVAS.

## Fase 3 — Job de Polling
- [x] `pollAllPlayers()` em `src/jobs/pollPlayers.ts` itera os players cadastrados (com try/catch por player, um erro não trava os outros).
- [x] Busca novas partidas (últimas 10) → salva em `Match` (upsert por `matchId`, idempotente) → cria `NotificationEvent` tipo `MATCH`.
- [x] Busca rank atual (League-V4 by-puuid) → compara com último `RankSnapshot` usando `src/riot/rank.ts` (`rankToValue`, considera troca de divisão/tier) → se mudou, calcula `lpChange`/`lpBalance`, salva snapshot, cria `NotificationEvent` tipo `RANK_CHANGE`.
- [x] Consulta Spectator → se entrou/saiu de partida, atualiza `currentGameId`, cria `NotificationEvent` tipo `LIVE_GAME` quando entra numa partida nova.
- [x] `src/jobs/scheduler.ts` agenda com `node-cron` a cada 5 min (`POLL_CRON_EXPRESSION`, configurável). `src/index.ts` roda um polling imediato ao iniciar e depois agenda os próximos.
- [x] Testado contra a API real com os 3 players cadastrados: 23 partidas novas detectadas e salvas na primeira rodada; segunda rodada não duplicou nada (idempotência confirmada).

## Fase 4 — Notificações
- [x] `src/notifications/discord.ts`: envio via webhook, com chunking (limite de 2000 chars) e retry automático em `429` (`retry_after`).
- [x] `src/notifications/formatMessage.ts`: formata cada `NotificationType` (`MATCH`, `RANK_CHANGE`, `LIVE_GAME`) numa linha de mensagem.
- [x] `dispatchRealtimeNotifications()` (`src/jobs/dispatchNotifications.ts`): pega `NotificationEvent` `PENDING` de players `REALTIME`, envia (com delay entre mensagens pra não estourar rate limit do webhook), marca `SENT`. Rodando automaticamente após cada ciclo de polling (`runPollCycle` no scheduler).
- [x] `dispatchDailySummaries()`: junta `PENDING` de players `DAILY_SUMMARY` numa única mensagem por player, envia, marca `SENT`. Agendado via cron separado (`DAILY_SUMMARY_CRON_EXPRESSION`, default 22h).
- [x] Testado contra o Discord real: 23 mensagens do backlog da Fase 3 enviadas com sucesso, confirmado visualmente no canal.
- [ ] WhatsApp fica pra depois (fora do MVP) — Discord webhook é o canal inicial.

## Fase 5 — Rodando de Ponta a Ponta
- [x] Rodar o processo localmente com os 3 players reais e validar as notificações chegando no Discord — confirmado.
- [ ] Deixar rodando por mais tempo (`npm run dev`, ciclo automático a cada 5min) e ajustar intervalos/mensagens conforme uso real.

## Fase 6 — Deploy na VPS
- [ ] `Dockerfile` do serviço Node (build + start).
- [ ] Adicionar serviço `app` ao `docker-compose.yml`, na mesma rede do `db`, conectando via `db:5432` (porta do Postgres não exposta pra internet, só a rede interna do Docker).
- [ ] `restart: unless-stopped` nos dois serviços, pra sobreviver a reboot/crash da VPS.
- [ ] Instalar Docker + Docker Compose na VPS, clonar o repo, criar o `.env` de produção lá.
- [ ] Subir com `docker compose up -d`, rodar a migration em produção.
- [ ] Validar notificações chegando no Discord a partir da VPS.
- [ ] Fluxo de atualização: `git pull && docker compose up -d --build`.

## Fase 7 — Gráfico de rank ao longo do tempo
- [x] `src/jobs/rankHistory.ts`: `buildRankHistory(granularity)` agrupa os `RankSnapshot`
  por dia/semana/mês (fuso `America/Sao_Paulo`), faz forward-fill pra alinhar as séries
  entre players e usa o rank corrente do `Player` como último ponto. Índice
  `@@index([playerId, capturedAt])` adicionado (migration `ranksnapshot_history_index`).
- [x] `src/notifications/rankChart.ts`: monta um SVG (linha por player, rótulos de elo/LP
  tipo op.gg) e rasteriza em PNG com `@resvg/resvg-js`. Alpine precisa de fontes —
  `ttf-dejavu` + `fontconfig` adicionados ao `Dockerfile`.
- [x] Slash command `/historico periodo:[diário|semanal|mensal] player:[Riot ID opcional]`
  (`discordBot.ts` + `interactions.ts`). Sem `player` = todas as linhas sobrepostas.
- [x] Script de preview local: `npx tsx src/scripts/rank-chart-once.ts [semanal|diario|mensal] [riotId]`
  → grava `rank-chart.png`.
- [x] Anexo opcional do gráfico semanal no leaderboard diário, atrás de `LEADERBOARD_CHART=1`.
- [x] Histórico encheu sozinho — o processo ficou de pé na VPS, ~250 partidas e 3 semanas
  de `RankSnapshot` até 09/09.

## Fase 8 — Comando `/resumo` (estilo op.gg) + backfill de detalhe das partidas
- [x] `Match` ganhou colunas de detalhe (`queueId`, `position`, `teamId`, `cs`,
  `durationSeconds`, `killParticipation`, `goldEarned`, `visionScore`, `allies` Json,
  `detailFetchedAt`) + `@@index([playerId, playedAt])` (migration `match_detail_columns`).
  Antes esses dados só existiam no `payload` da notificação.
- [x] `src/riot/matchDetail.ts`: `extractMatchDetail()` centraliza a extração (usada pelo
  polling e pelo backfill).
- [x] `src/jobs/pollPlayers.ts`: o `match.upsert` grava as colunas novas daqui pra frente.
- [x] `src/scripts/backfill-match-details.ts`: puxa da Match-V5 todas as partidas do
  desafio (paginado, `startTime`), cria as que faltam e preenche o detalhe. Idempotente
  (`--all` refaz tudo). Rodar **uma vez** por deploy: `node dist/scripts/backfill-match-details.js`.
- [x] `src/util/time.ts`: helper de fuso `America/Sao_Paulo` (extraído de `rankHistory.ts`).
- [x] `src/jobs/playerSummary.ts`: `buildPlayerSummary` / `buildGroupSummary` — tabela de
  campeões, métricas gerais, atividade (dia/hora), duos e rotas, tudo desde `CHALLENGE_START`.
- [x] `src/notifications/summaryEmbed.ts`: embed individual e de grupo (tabelas monospace,
  barras em bloco).
- [x] Slash command `/resumo player:[Riot ID opcional]` (`discordBot.ts` + `interactions.ts`).
  Sem `player` = resumo comparativo do grupo. Helper `resolvePlayer` compartilhado com `/historico`.
- [x] Preview local: `npx tsx src/scripts/summary-once.ts [riotId]`.

## Depois (fora do escopo inicial)
- [ ] Integração WhatsApp.
- [ ] Frontend simples (cadastro de players, configuração de `notifyMode`).
