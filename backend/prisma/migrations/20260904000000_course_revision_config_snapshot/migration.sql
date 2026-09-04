-- Section revisions previously captured only `title` and `contentJson`, so a
-- write that changed only a config column (a video's youtubeId, a deck's
-- audioUrl, a walkthrough's tourId) left no history at all and could not be
-- rolled back. Nullable: rows written before this column carry no settings, and
-- rollback must treat that as "says nothing" rather than "was empty".
ALTER TABLE "CourseSectionRevision" ADD COLUMN "configJson" JSONB;
