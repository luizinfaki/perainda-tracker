-- DropIndex
DROP INDEX "Match_matchId_key";

-- CreateIndex
CREATE UNIQUE INDEX "Match_playerId_matchId_key" ON "Match"("playerId", "matchId");
