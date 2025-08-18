-- AlterTable
ALTER TABLE "Room" ADD COLUMN     "botCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "solo" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "BotInstance" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "profileCode" VARCHAR(50) NOT NULL,
    "seededAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BotInstance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BotInstance_roomId_idx" ON "BotInstance"("roomId");

-- AddForeignKey
ALTER TABLE "BotInstance" ADD CONSTRAINT "BotInstance_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
