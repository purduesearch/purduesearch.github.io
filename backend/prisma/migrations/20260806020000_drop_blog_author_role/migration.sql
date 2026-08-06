-- BlogAuthor.role was a half-built ACL superseded by DocAccessGrant. BlogAuthor
-- is now purely the byline concept its name describes.
ALTER TABLE "BlogAuthor" DROP COLUMN "role";
