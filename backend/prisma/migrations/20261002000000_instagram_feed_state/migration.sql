-- Single-row cache of the club's Instagram feed (token encrypted at rest).
CREATE TABLE "InstagramFeedState" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "accessTokenEnc" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "postsJson" TEXT NOT NULL DEFAULT '[]',
    "fetchedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstagramFeedState_pkey" PRIMARY KEY ("id")
);
