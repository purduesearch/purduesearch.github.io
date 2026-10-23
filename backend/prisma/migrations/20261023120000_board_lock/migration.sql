-- Live board card locks: a mirror of the presence relay's in-memory locks.
-- UNLOGGED: no WAL traffic, and crash recovery empties it, which only
-- releases locks early. Prisma does not model UNLOGGED; the schema model
-- matches the columns, so no drift is reported.
CREATE UNLOGGED TABLE "BoardLock" (
    "taskId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BoardLock_pkey" PRIMARY KEY ("taskId")
);

CREATE INDEX "BoardLock_expiresAt_idx" ON "BoardLock"("expiresAt");
