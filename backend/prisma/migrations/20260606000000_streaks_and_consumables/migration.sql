-- Streak system + consumables inventory + active effects (Phase 2 of engagement overhaul).
--
-- Non-destructive: only adds new tables and new nullable / default-valued columns on Member.

BEGIN;

-- ── Enums ───────────────────────────────────────────────────────

CREATE TYPE "InventoryItemKey" AS ENUM ('STREAK_FREEZE', 'XP_BOOST_24H', 'KUDOS_REFILL', 'SHOP_REROLL');
CREATE TYPE "EffectKey"        AS ENUM ('XP_BOOST_24H', 'DOUBLOON_BOOST_24H');

-- ── Member additions ────────────────────────────────────────────

ALTER TABLE "Member"
  ADD COLUMN "weeklyBonusSends"      INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN "weeklyBonusSendsWeek"  TIMESTAMP(3),
  ADD COLUMN "celebrationConsumedAt" TIMESTAMP(3);

-- ── Streak ──────────────────────────────────────────────────────

CREATE TABLE "Streak" (
    "id"                    TEXT         NOT NULL,
    "memberId"              TEXT         NOT NULL,
    "currentStreak"         INTEGER      NOT NULL DEFAULT 0,
    "longestStreak"         INTEGER      NOT NULL DEFAULT 0,
    "lastActivityDate"      TIMESTAMP(3),
    "freezesUsedThisStreak" INTEGER      NOT NULL DEFAULT 0,
    "updatedAt"             TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Streak_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Streak_memberId_key" ON "Streak"("memberId");

ALTER TABLE "Streak"
  ADD CONSTRAINT "Streak_memberId_fkey"
  FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── DailyActivity ───────────────────────────────────────────────

CREATE TABLE "DailyActivity" (
    "id"            TEXT         NOT NULL,
    "memberId"      TEXT         NOT NULL,
    "date"          TIMESTAMP(3) NOT NULL,
    "actionCount"   INTEGER      NOT NULL DEFAULT 0,
    "firstActionAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyActivity_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DailyActivity_memberId_date_key" ON "DailyActivity"("memberId", "date");
CREATE INDEX        "DailyActivity_memberId_date_idx" ON "DailyActivity"("memberId", "date");

ALTER TABLE "DailyActivity"
  ADD CONSTRAINT "DailyActivity_memberId_fkey"
  FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── MemberInventory ─────────────────────────────────────────────

CREATE TABLE "MemberInventory" (
    "id"         TEXT             NOT NULL,
    "memberId"   TEXT             NOT NULL,
    "itemKey"    "InventoryItemKey" NOT NULL,
    "quantity"   INTEGER          NOT NULL DEFAULT 0,
    "acquiredAt" TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3)     NOT NULL,

    CONSTRAINT "MemberInventory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MemberInventory_memberId_itemKey_key" ON "MemberInventory"("memberId", "itemKey");
CREATE INDEX        "MemberInventory_memberId_idx"        ON "MemberInventory"("memberId");

ALTER TABLE "MemberInventory"
  ADD CONSTRAINT "MemberInventory_memberId_fkey"
  FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── ActiveEffect ────────────────────────────────────────────────

CREATE TABLE "ActiveEffect" (
    "id"         TEXT         NOT NULL,
    "memberId"   TEXT         NOT NULL,
    "effectKey"  "EffectKey"  NOT NULL,
    "multiplier" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "expiresAt"  TIMESTAMP(3) NOT NULL,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActiveEffect_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ActiveEffect_memberId_effectKey_key"   ON "ActiveEffect"("memberId", "effectKey");
CREATE INDEX        "ActiveEffect_memberId_expiresAt_idx"   ON "ActiveEffect"("memberId", "expiresAt");

ALTER TABLE "ActiveEffect"
  ADD CONSTRAINT "ActiveEffect_memberId_fkey"
  FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
