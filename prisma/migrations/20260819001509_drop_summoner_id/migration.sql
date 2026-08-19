/*
  Warnings:

  - You are about to drop the column `summonerId` on the `Player` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "Player_summonerId_key";

-- AlterTable
ALTER TABLE "Player" DROP COLUMN "summonerId";
