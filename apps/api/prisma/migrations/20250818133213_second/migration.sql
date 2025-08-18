-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('text', 'word');

-- CreateEnum
CREATE TYPE "BillingStatus" AS ENUM ('paid', 'refunded');

-- CreateEnum
CREATE TYPE "BillingType" AS ENUM ('hint_letter');

-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" "QuestionType" NOT NULL,
    "category" VARCHAR(100),
    "prompt" TEXT NOT NULL,
    "rawAnswer" TEXT NOT NULL,
    "canonicalAnswer" TEXT NOT NULL,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingPurchase" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" BIGINT NOT NULL,
    "type" "BillingType" NOT NULL,
    "qty" INTEGER NOT NULL,
    "status" "BillingStatus" NOT NULL DEFAULT 'paid',
    "tgPaymentId" TEXT NOT NULL,

    CONSTRAINT "BillingPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserMeta" (
    "id" TEXT NOT NULL,
    "userId" BIGINT NOT NULL,
    "hintAllowance" INTEGER NOT NULL DEFAULT 0,
    "profileScore" INTEGER NOT NULL DEFAULT 0,
    "achievements" JSONB,

    CONSTRAINT "UserMeta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BillingPurchase_userId_idx" ON "BillingPurchase"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserMeta_userId_key" ON "UserMeta"("userId");

-- AddForeignKey
ALTER TABLE "BillingPurchase" ADD CONSTRAINT "BillingPurchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserMeta" ADD CONSTRAINT "UserMeta_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
