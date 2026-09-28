-- Project leads: admin-equivalent task permissions scoped to one project.
ALTER TABLE "ProjectMember" ADD COLUMN "isLead" BOOLEAN NOT NULL DEFAULT false;

-- Carry over members already titled exactly "Lead" (the press kit treated them as leads).
UPDATE "ProjectMember" SET "isLead" = true WHERE UPPER("projectRole") = 'LEAD';
