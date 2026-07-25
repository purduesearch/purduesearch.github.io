-- AlterTable — add the theme column that schema.prisma declares but no
-- prior migration created. Both BlogPost and ProjectPressKit use it for
-- the Section Builder per-document theme ({ accent, fontPair, width }).
ALTER TABLE "BlogPost" ADD COLUMN "theme" JSONB;

ALTER TABLE "ProjectPressKit" ADD COLUMN "theme" JSONB;
