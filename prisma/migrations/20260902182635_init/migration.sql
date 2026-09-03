-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "MonitorType" AS ENUM ('X_USER', 'TG_CHANNEL', 'TG_GROUP');

-- CreateEnum
CREATE TYPE "MessageSource" AS ENUM ('X', 'TELEGRAM');

-- CreateEnum
CREATE TYPE "NotificationChannelType" AS ENUM ('TELEGRAM', 'WECHAT');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "MonitorTarget" (
    "id" TEXT NOT NULL,
    "type" "MonitorType" NOT NULL,
    "name" TEXT NOT NULL,
    "username" TEXT,
    "externalId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastCursor" TEXT,
    "lastMessageAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonitorTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "source" "MessageSource" NOT NULL,
    "externalId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "authorExternalId" TEXT,
    "authorUsername" TEXT,
    "authorName" TEXT,
    "content" TEXT NOT NULL,
    "url" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationChannel" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "NotificationChannelType" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationTask" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramAccount" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "session" TEXT NOT NULL,
    "connected" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MonitorTarget_enabled_type_idx" ON "MonitorTarget"("enabled", "type");

-- CreateIndex
CREATE UNIQUE INDEX "MonitorTarget_type_externalId_key" ON "MonitorTarget"("type", "externalId");

-- CreateIndex
CREATE INDEX "Message_targetId_publishedAt_idx" ON "Message"("targetId", "publishedAt");

-- CreateIndex
CREATE INDEX "Message_source_publishedAt_idx" ON "Message"("source", "publishedAt");

-- CreateIndex
CREATE INDEX "Message_publishedAt_idx" ON "Message"("publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Message_source_externalId_key" ON "Message"("source", "externalId");

-- CreateIndex
CREATE INDEX "NotificationTask_status_createdAt_idx" ON "NotificationTask"("status", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationTask_channelId_status_idx" ON "NotificationTask"("channelId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationTask_messageId_channelId_key" ON "NotificationTask"("messageId", "channelId");

-- CreateIndex
CREATE UNIQUE INDEX "AppSetting_key_key" ON "AppSetting"("key");

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "MonitorTarget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationTask" ADD CONSTRAINT "NotificationTask_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationTask" ADD CONSTRAINT "NotificationTask_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "NotificationChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

