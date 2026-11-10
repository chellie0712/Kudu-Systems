-- CreateEnum
CREATE TYPE "WorkflowRunStatus" AS ENUM ('WAITING', 'RUNNING', 'DONE', 'FAILED', 'SKIPPED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Workflow" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT false,
    "activeSince" TIMESTAMP(3),
    "trigger" TEXT NOT NULL,
    "triggerConfig" JSONB NOT NULL DEFAULT '{}',
    "conditions" JSONB NOT NULL DEFAULT '[]',
    "waitMinutes" INTEGER NOT NULL DEFAULT 0,
    "oncePer" BOOLEAN NOT NULL DEFAULT false,
    "actions" JSONB NOT NULL DEFAULT '[]',
    "runCount" INTEGER NOT NULL DEFAULT 0,
    "lastRunAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workflow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowRun" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "link" TEXT NOT NULL DEFAULT '',
    "status" "WorkflowRunStatus" NOT NULL,
    "runAt" TIMESTAMP(3),
    "depth" INTEGER NOT NULL DEFAULT 0,
    "log" JSONB NOT NULL DEFAULT '[]',
    "dedupeKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "WorkflowRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkflowRun_status_runAt_idx" ON "WorkflowRun"("status", "runAt");

-- CreateIndex
CREATE INDEX "WorkflowRun_workflowId_createdAt_idx" ON "WorkflowRun"("workflowId", "createdAt");

-- CreateIndex
CREATE INDEX "WorkflowRun_workflowId_subjectId_idx" ON "WorkflowRun"("workflowId", "subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowRun_workflowId_dedupeKey_key" ON "WorkflowRun"("workflowId", "dedupeKey");

-- AddForeignKey
ALTER TABLE "WorkflowRun" ADD CONSTRAINT "WorkflowRun_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

