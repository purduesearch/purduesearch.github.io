-- Club-wide Google Photos albums shared by link (services/photoAlbumService.ts).
-- CreateTable
CREATE TABLE "PhotoAlbum" (
    "id" TEXT NOT NULL,
    "googleAlbumId" TEXT NOT NULL,
    "shareUrl" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "coverUrl" TEXT,
    "photoCount" INTEGER,
    "addedById" TEXT NOT NULL,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PhotoAlbum_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PhotoAlbum_googleAlbumId_key" ON "PhotoAlbum"("googleAlbumId");

-- CreateIndex
CREATE INDEX "PhotoAlbum_addedById_idx" ON "PhotoAlbum"("addedById");

-- AddForeignKey
ALTER TABLE "PhotoAlbum" ADD CONSTRAINT "PhotoAlbum_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
