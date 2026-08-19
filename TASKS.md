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
- [ ] Script simples (CLI ou seed) pra cadastrar um player: recebe `gameName#tagLine`, busca PUUID + Summoner ID, salva no banco com `notifyMode` default.
- [ ] Cadastrar os players do grupo pra testar o resto do fluxo.

## Fase 3 — Job de Polling
- [ ] Função que itera os players cadastrados.
- [ ] Buscar novas partidas → salvar em `Match` → criar `NotificationEvent` tipo `MATCH`.
- [ ] Buscar rank atual → comparar com último `RankSnapshot` → se mudou, calcular `lpChange`/`lpBalance`, salvar snapshot, criar `NotificationEvent` tipo `RANK_CHANGE`.
- [ ] Consultar spectator → se entrou/saiu de partida, atualizar `currentGameId`, criar `NotificationEvent` tipo `LIVE_GAME` quando entrar.
- [ ] Agendar com `node-cron` (ex: a cada 5 minutos) rodando dentro do processo.

## Fase 4 — Notificações
- [ ] Função de envio pro Discord via webhook (mensagem formatada por tipo de evento).
- [ ] Dispatcher: pega `NotificationEvent` `PENDING` de players `REALTIME`, envia na hora, marca `SENT`.
- [ ] Job de resumo diário: junta `PENDING` de players `DAILY_SUMMARY`, manda uma mensagem só, marca `SENT`.
- [ ] WhatsApp fica pra depois (fora do MVP) — Discord webhook é o canal inicial.

## Fase 5 — Rodando de Ponta a Ponta
- [ ] Rodar o processo localmente com 1-2 players reais e validar as notificações chegando no Discord.
- [ ] Ajustar intervalos de polling / mensagens conforme uso real.

## Fase 6 — Deploy na VPS
- [ ] `Dockerfile` do serviço Node (build + start).
- [ ] Adicionar serviço `app` ao `docker-compose.yml`, na mesma rede do `db`, conectando via `db:5432` (porta do Postgres não exposta pra internet, só a rede interna do Docker).
- [ ] `restart: unless-stopped` nos dois serviços, pra sobreviver a reboot/crash da VPS.
- [ ] Instalar Docker + Docker Compose na VPS, clonar o repo, criar o `.env` de produção lá.
- [ ] Subir com `docker compose up -d`, rodar a migration em produção.
- [ ] Validar notificações chegando no Discord a partir da VPS.
- [ ] Fluxo de atualização: `git pull && docker compose up -d --build`.

## Depois (fora do escopo inicial)
- [ ] Integração WhatsApp.
- [ ] Frontend simples (cadastro de players, configuração de `notifyMode`).
