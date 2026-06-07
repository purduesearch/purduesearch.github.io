-- Task.attachments: text[] -> jsonb
--
-- The frontend already stores attachments as { url, label } objects (see
-- AttachmentPickerModal / TaskModal). The old text[] column meant every save
-- silently stringified the object, and any legacy bare strings crash the
-- modal's renderer which reads `att.url`. This migration converts existing
-- rows to the structured shape before changing the column type.

BEGIN;

-- 1. Backfill any legacy bare strings into { url, label } objects, stored
--    transitionally in a new jsonb column.
ALTER TABLE "Task" ADD COLUMN "attachments_json" JSONB NOT NULL DEFAULT '[]'::jsonb;

UPDATE "Task"
SET "attachments_json" = COALESCE(
  (
    SELECT to_jsonb(array_agg(
      jsonb_build_object('url', x, 'label', x)
    ))
    FROM unnest("attachments") AS x
    WHERE x IS NOT NULL AND x <> ''
  ),
  '[]'::jsonb
)
WHERE "attachments" IS NOT NULL;

-- 2. Drop the legacy text[] and rename the new jsonb column into place.
ALTER TABLE "Task" DROP COLUMN "attachments";
ALTER TABLE "Task" RENAME COLUMN "attachments_json" TO "attachments";

COMMIT;
