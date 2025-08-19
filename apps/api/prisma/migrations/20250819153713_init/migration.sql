/*
  Warnings:

  - You are about to drop the column `category` on the `Question` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Question" DROP COLUMN "category",
ADD COLUMN     "answersAccept" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "answersReject" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "categoryId" TEXT,
ADD COLUMN     "hint" TEXT,
ADD COLUMN     "language" VARCHAR(10),
ADD COLUMN     "requireFull" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "value" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "title" VARCHAR(255) NOT NULL,
    "tags" TEXT[],

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Category_title_key" ON "Category"("title");

-- CreateIndex
CREATE INDEX "Question_categoryId_idx" ON "Question"("categoryId");

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
