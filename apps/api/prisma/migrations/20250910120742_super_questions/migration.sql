-- CreateEnum
CREATE TYPE "RoomSessionStatus" AS ENUM ('active', 'completed');

-- CreateTable
CREATE TABLE "SuperQuestion" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "questionId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "options" JSONB NOT NULL,
    "correctIndex" INTEGER NOT NULL,
    "locale" VARCHAR(10),
    "tags" TEXT[],
    "difficulty" INTEGER,
    "weight" INTEGER,
    "explanation" TEXT,
    "lastUsedAt" TIMESTAMP(3),
    "createdBy" BIGINT,

    CONSTRAINT "SuperQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomSession" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "status" "RoomSessionStatus" NOT NULL DEFAULT 'active',

    CONSTRAINT "RoomSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomSuperCell" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "round" INTEGER,
    "categoryId" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "superQuestionId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoomSuperCell_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SuperQuestion_questionId_idx" ON "SuperQuestion"("questionId");

-- CreateIndex
CREATE INDEX "RoomSession_roomId_idx" ON "RoomSession"("roomId");

-- CreateIndex
CREATE INDEX "RoomSuperCell_sessionId_idx" ON "RoomSuperCell"("sessionId");

-- CreateIndex
CREATE INDEX "RoomSuperCell_categoryId_value_idx" ON "RoomSuperCell"("categoryId", "value");

-- CreateIndex
CREATE INDEX "RoomSuperCell_superQuestionId_idx" ON "RoomSuperCell"("superQuestionId");

-- CreateIndex
CREATE UNIQUE INDEX "RoomSuperCell_sessionId_categoryId_value_key" ON "RoomSuperCell"("sessionId", "categoryId", "value");

-- CreateIndex
CREATE UNIQUE INDEX "RoomSuperCell_sessionId_superQuestionId_key" ON "RoomSuperCell"("sessionId", "superQuestionId");

-- CreateIndex
CREATE INDEX "Question_categoryId_value_idx" ON "Question"("categoryId", "value");

-- AddForeignKey
ALTER TABLE "SuperQuestion" ADD CONSTRAINT "SuperQuestion_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomSession" ADD CONSTRAINT "RoomSession_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomSuperCell" ADD CONSTRAINT "RoomSuperCell_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "RoomSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomSuperCell" ADD CONSTRAINT "RoomSuperCell_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomSuperCell" ADD CONSTRAINT "RoomSuperCell_superQuestionId_fkey" FOREIGN KEY ("superQuestionId") REFERENCES "SuperQuestion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
