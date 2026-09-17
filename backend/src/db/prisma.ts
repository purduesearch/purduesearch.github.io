import { PrismaClient, type Member } from "@prisma/client";

// Encrypted credentials on Member are omitted from EVERY query by default,
// including nested includes (`members: { include: { member: true } }`,
// `assignees: true`, `author: true`, ...). Those relations are serialized
// straight into API responses all over the codebase, so stripping at each
// response site cannot keep up — one forgotten include used to ship every
// project member's ciphertext to any signed-in member via GET /api/projects.
//
// Code that genuinely needs one of these reads it with an explicit
// `select: { slackUserToken: true }` (or `omit: { slackUserToken: false }`);
// the client's types reflect the omission, so tsc flags any other reader.
export const MEMBER_SECRET_OMIT = {
  slackUserToken: true,
  githubAccessToken: true,
  githubRefreshToken: true,
  icsFeedUrl: true,
} as const;

/** A Member row as this client returns it — Prisma's `Member` minus the omitted secrets. */
export type AppMember = Omit<Member, keyof typeof MEMBER_SECRET_OMIT>;

function createPrismaClient() {
  return new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
    omit: { member: MEMBER_SECRET_OMIT },
  });
}

type AppPrismaClient = ReturnType<typeof createPrismaClient>;

// Singleton pattern: reuse the same PrismaClient across hot-reloads in dev
const globalForPrisma = globalThis as unknown as {
  prisma: AppPrismaClient | undefined;
};

export const prisma: AppPrismaClient = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
