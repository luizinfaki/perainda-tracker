-- AlterTable
ALTER TABLE "Match" ADD COLUMN     "allies" JSONB,
ADD COLUMN     "cs" INTEGER,
ADD COLUMN     "detailFetchedAt" TIMESTAMP(3),
ADD COLUMN     "durationSeconds" INTEGER,
ADD COLUMN     "goldEarned" INTEGER,
ADD COLUMN     "killParticipation" DOUBLE PRECISION,
ADD COLUMN     "position" TEXT,
ADD COLUMN     "queueId" INTEGER,
ADD COLUMN     "teamId" INTEGER,
ADD COLUMN     "visionScore" INTEGER;

-- CreateIndex
CREATE INDEX "Match_playerId_playedAt_idx" ON "Match"("playerId", "playedAt");
