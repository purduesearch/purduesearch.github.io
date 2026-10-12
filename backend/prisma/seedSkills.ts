// Seeds the starter skill taxonomy. Idempotent and additive: safe to re-run, never
// deletes or edits skills an admin has since changed.
// Run: cd backend && npm run seed:skills

import { prisma } from "../src/db/prisma.js";
import { seedTaxonomy } from "../src/services/skillTaxonomyService.js";
import { SEED_SKILLS } from "../src/services/skillSeedData.js";

try {
  const result = await seedTaxonomy(SEED_SKILLS);
  console.log(`Skills seed: ${result.created} created, ${result.existing} already present, ${result.aliases} aliases and ${result.edges} links added.`);
} finally {
  await prisma.$disconnect();
}
