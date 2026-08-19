# Instruções do Sistema & Contexto do Projeto

## 1. Visão Geral do Projeto
**Nome:** Perainda Tracker
**Descrição:** Um app para monitorar um grupo cadastrado de jogadores de League of Legends. O sistema acompanha continuamente cada player registrado via Riot API e envia notificações automáticas (Discord e/ou WhatsApp) com atualizações relevantes, incluindo:
*   Novas partidas no histórico (histórico de partidas atualizado).
*   Detalhes da partida (campeão jogado, KDA, resultado, etc.).
*   Ganhos/perdas de PDL (LP) e mudanças de rank/divisão.
*   Status de partida atual (se o player estiver em uma partida ao vivo/spectate).

## 2. Stack Tecnológica (Recomendada/Padrão)
**Foco atual:** apenas o serviço de coleta (backend), responsável por consultar a Riot API, persistir os dados e disparar as notificações. Um frontend simples em React (para cadastrar jogadores, configurar notificações, etc.) será adicionado depois, sobre esse mesmo serviço.

*   **Runtime:** Node.js + TypeScript.
*   **Banco de Dados:** PostgreSQL (via Prisma ORM) para armazenar players cadastrados, partidas já processadas (evita notificação duplicada) e último status de rank/LP conhecido.
*   **Agendamento de Jobs:** node-cron, rodando dentro do próprio processo Node.js (processo de longa duração, ex: em VPS/container), disparando as checagens periódicas na Riot API.
*   **Notificações:** integração com Discord (webhook) e/ou WhatsApp para envio das mensagens.
*   **Frontend (futuro):** Next.js (React) + Tailwind CSS, consumindo o mesmo backend — fora de escopo por enquanto.

## 3. Regras de Integração com a Riot API
**CRÍTICO:** A Riot API tem limites de requisição rígidos. O app DEVE implementar uma fila ou mecanismo de espera para evitar erros `429 Too Many Requests`.
*   **Limites da Development Key:** 20 requisições a cada 1 segundo / 100 requisições a cada 2 minutos.
*   **Roteamento:**
    *   Informações de conta usam roteamento regional (ex: `americas.api.riotgames.com`).
    *   Informações de Liga/Summoner usam roteamento de plataforma (ex: `br1.api.riotgames.com`).

**Nota (confirmado em teste manual, ago/2026):** a Riot descontinuou o `encryptedSummonerId` — o Summoner-V4 não retorna mais os campos `id`/`accountId`. O **PUUID é a única chave necessária** pra todos os endpoints abaixo; o Summoner-V4 vira opcional, só pra dados complementares (nível, ícone).

### Endpoints Essenciais:
1.  **Obter PUUID:** `GET /riot/account/v1/accounts/by-riot-id/{gameName}/{tagLine}` (roteamento regional).
2.  **Obter dados complementares do Summoner (opcional — nível, ícone):** `GET /lol/summoner/v4/summoners/by-puuid/{puuid}` (roteamento de plataforma).
3.  **Obter Status Ranqueado (LP, Tier):** `GET /lol/league/v4/entries/by-puuid/{puuid}` (roteamento de plataforma).
4.  **Obter Histórico de Partidas (IDs):** `GET /lol/match/v5/matches/by-puuid/{puuid}/ids` (roteamento regional).
5.  **Obter Detalhes da Partida:** `GET /lol/match/v5/matches/{matchId}` (roteamento regional).
6.  **Obter Partida Atual (Spectator, para status "em partida"):** `GET /lol/spectator/v5/active-games/by-summoner/{puuid}` (roteamento de plataforma; retorna `404` quando o player não está em partida — tratar como estado normal, não como erro).

## 4. Arquitetura Central & Fluxo de Dados
1.  **Cadastro:** Usuário informa o `Riot ID` (Nome#Tag) e o modo de notificação (`REALTIME` ou `DAILY_SUMMARY`). O backend busca o PUUID via Account-V1 e salva no banco.
2.  **Polling (Cron Job — roda a cada N minutos):**
    *   Itera por todos os players cadastrados.
    *   Busca os IDs de partidas mais recentes. Filtra os IDs que já existem no banco.
    *   Para cada novo ID de partida, busca o JSON detalhado, extrai as estatísticas (Kills, Deaths, Assists, Vitória/Derrota, Campeão) e salva em `Match`. Cria um `NotificationEvent` do tipo `MATCH`.
    *   Busca o Tier/Rank/LP ranqueado atual. Se mudou desde o último `RankSnapshot`, calcula `lpChange` (considerando promoção/rebaixamento de divisão) e `lpBalance` (saldo acumulado), salva um novo `RankSnapshot` e cria um `NotificationEvent` do tipo `RANK_CHANGE`.
    *   Consulta a Spectator API. Se o player está em partida e o `currentGameId` mudou (nova partida ao vivo), atualiza o `Player` e cria um `NotificationEvent` do tipo `LIVE_GAME`. Se não está mais em partida, limpa o `currentGameId`.
3.  **Dispatcher de Notificações:**
    *   Para cada `NotificationEvent` `PENDING` de um player `REALTIME`: envia a mensagem (Discord webhook e/ou WhatsApp) imediatamente e marca como `SENT`.
    *   Para players `DAILY_SUMMARY`: os eventos ficam `PENDING`, acumulando ao longo do dia.
4.  **Job de Resumo Diário (Cron separado, ex: uma vez por dia):**
    *   Para cada player `DAILY_SUMMARY`, busca todos os `NotificationEvent` `PENDING`, agrupa em uma única mensagem-resumo (partidas jogadas, saldo de LP do dia, etc.), envia e marca todos como `SENT`.

## 5. Schema do Banco de Dados (Conceitual)

```prisma
enum NotifyMode {
  REALTIME
  DAILY_SUMMARY
}

enum NotificationType {
  MATCH
  RANK_CHANGE
  LIVE_GAME
}

enum NotificationStatus {
  PENDING
  SENT
}

model Player {
  id                 String              @id @default(cuid())
  riotId             String              // ex: "Faker"
  tagLine            String              // ex: "KR1"
  puuid              String              @unique
  tier               String?             // ex: "GOLD"
  rank               String?             // ex: "I", "II"
  lp                 Int                 @default(0)
  currentGameId      String?             // preenchido enquanto o player está em partida ao vivo
  notifyMode         NotifyMode          @default(REALTIME)
  matches            Match[]
  rankSnapshots      RankSnapshot[]
  notificationEvents NotificationEvent[]
}

model Match {
  id         String   @id @default(cuid())
  matchId    String   @unique // ID da partida na Riot
  player     Player   @relation(fields: [playerId], references: [id])
  playerId   String
  win        Boolean
  kills      Int
  deaths     Int
  assists    Int
  champion   String
  playedAt   DateTime
}

model RankSnapshot {
  id         String   @id @default(cuid())
  player     Player   @relation(fields: [playerId], references: [id])
  playerId   String
  tier       String
  rank       String
  lp         Int
  lpChange   Int      // diferença em relação ao snapshot anterior (considera troca de divisão/tier)
  lpBalance  Int      // saldo acumulado desde o primeiro snapshot
  capturedAt DateTime @default(now())
}

model NotificationEvent {
  id          String             @id @default(cuid())
  player      Player             @relation(fields: [playerId], references: [id])
  playerId    String
  type        NotificationType
  referenceId String             // matchId, gameId, ou id do RankSnapshot — usado para idempotência
  payload     Json                // dados prontos para montar a mensagem
  status      NotificationStatus @default(PENDING)
  createdAt   DateTime           @default(now())
  sentAt      DateTime?

  @@unique([playerId, type, referenceId])
}
```

## 6. Diretrizes de Desenvolvimento com IA (Regras para Claude/Assistente de IA)
*   **Segurança:** NUNCA escrever chaves de API fixas (hardcoded) no código. Sempre usar `process.env.RIOT_API_KEY`.
*   **Rate Limiting:** Ao escrever lógica de busca na Riot API, sempre incluir uma função utilitária para lidar com os limites de requisição (ex: uma função de espera entre requisições ou um middleware de rate-limit).
*   **Tratamento de Erros:** Sempre tratar os erros da Riot API de forma resiliente, especialmente `404` (player/partida não encontrada) e `429` (limite de requisição excedido).
*   **Modularidade:** Manter as funções wrapper da Riot API separadas da lógica de negócio e dos handlers de rota.
*   **Idempotência:** Garantir que a lógica de busca de partidas não insira partidas duplicadas caso o script rode duas vezes simultaneamente.
