-- CreateTable
CREATE TABLE "GoogleDriveCredential" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "refreshToken" TEXT NOT NULL,
    "accountEmail" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "connectedById" TEXT,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleDriveCredential_pkey" PRIMARY KEY ("id")
);
