ALTER TABLE "VaultRepository"
 ADD COLUMN "phase3VerifiedAt" TIMESTAMP(3),
 ADD COLUMN "phase3DriveVersions" INTEGER,
 ADD COLUMN "phase3DriveThumbnails" INTEGER,
 ADD COLUMN "phase3DriveItems" INTEGER,
 ADD COLUMN "cutoverAt" TIMESTAMP(3),
 ADD COLUMN "retentionUntil" TIMESTAMP(3),
 ADD COLUMN "driftHeadSha" TEXT,
 ADD COLUMN "legacyWritesInFlight" INTEGER NOT NULL DEFAULT 0;
