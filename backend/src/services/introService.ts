// Talent directory + intro requests (locked decisions 5-8).
// - Sponsors see only members with shareWithSponsors, never bots or deactivated members, through the allow-list
//   card builder in talentDirectoryCore. An unknown, hidden or ineligible member is the same 404.
// - An intro request reaches the member first (reactive createNotification, preference-routed). Contact details
//   go both ways only after the member accepts: the sponsor sees the member's email, the member sees the sponsor's.
// - At most one pending request per sponsor-member pair and 20 requests per sponsor user per 7 days, enforced
//   inside one transaction under an advisory lock keyed on the sponsor user.
// - Expiry: lazy on every read, plus runSponsorMaintenance (hourly cron) marks overdue PENDING rows EXPIRED.
// Logs never contain email addresses or message text.
import {
  buildSponsorCard, cardName, matchesFilters, parseDirectoryQuery, pickedBullets, sortCards,
  type CardSource, type DirectoryFilters, type SponsorCard,
} from "./talentDirectoryCore.js";
import { isSponsorEligible, type SponsorUserRow } from "./sponsorAuthService.js";

export const INTRO_TTL_MS = 21 * 24 * 60 * 60 * 1000;
export const INTRO_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
export const INTRO_LIMIT = 20;
export const MAX_MESSAGE = 1000;
export const MAX_OPPORTUNITY_ID = 64;
export const CAREER_PATH = "/clubpm/profile?tab=skills&view=career";

export type IntroStatus = "PENDING" | "ACCEPTED" | "DECLINED" | "EXPIRED" | "WITHDRAWN";
export type IntroErrorCode = "INVALID" | "NOT_FOUND" | "CONFLICT" | "RATE_LIMITED";
export class IntroError extends Error {
  constructor(public code: IntroErrorCode, message: string) { super(message); }
}
export const INTRO_STATUS: Record<IntroErrorCode, number> = { INVALID: 400, NOT_FOUND: 404, CONFLICT: 409, RATE_LIMITED: 429 };

export interface IntroRow {
  id: string; sponsorUserId: string; memberId: string; opportunityId: string | null; message: string;
  status: IntroStatus; respondedAt: Date | null; expiresAt: Date; createdAt: Date;
}
export interface IntroWithSponsor extends IntroRow {
  sponsor: SponsorUserRow;
}
export interface MemberContact { id: string; displayName: string; email: string | null }

export interface IntroStore {
  /** Member ids with shareWithSponsors = true, isBot = false, deactivatedAt = null. */
  sharedMemberIds(): Promise<string[]>;
  /** The same eligibility check for one member; null when not shared, a bot, deactivated or unknown. */
  sharedMember(memberId: string): Promise<MemberContact | null>;
  /** Any member (for names on existing requests and the accept email). */
  member(memberId: string): Promise<MemberContact | null>;
  cardSource(memberId: string): Promise<CardSource | null>;
  disabledMetrics(): Promise<string[]>;
  /**
   * In one transaction (locked on sponsorUserId): reject a non-expired PENDING row for the pair, then reject when
   * the sponsor created `limit` or more rows since `since`, else insert.
   */
  createIntro(row: Omit<IntroRow, "id" | "status" | "respondedAt">, rule: { since: Date; limit: number; now: Date }): Promise<IntroRow | "DUPLICATE" | "RATE_LIMITED">;
  listForSponsor(sponsorUserId: string): Promise<IntroRow[]>;
  listForMember(memberId: string): Promise<IntroWithSponsor[]>;
  find(id: string): Promise<IntroWithSponsor | null>;
  /** Atomic: updates only when still PENDING, owned by memberId and expiresAt > now. True when one row changed. */
  respond(id: string, memberId: string, status: "ACCEPTED" | "DECLINED", now: Date): Promise<boolean>;
  /** Marks PENDING rows with expiresAt < now EXPIRED (optionally scoped); returns the count. */
  expireDue(now: Date, scope?: { memberId?: string; sponsorUserId?: string }): Promise<number>;
}

export type IntroNotify = (n: { recipientId: string; message: string; slackText: string; metadata: Record<string, unknown> }) => Promise<unknown>;
export type IntroMailer = (msg: { to: string; subject: string; html: string }) => Promise<void>;

export interface IntroDeps {
  store: IntroStore;
  now?: () => number;
  notify: IntroNotify;
  mailer: IntroMailer;
  frontendUrl: () => string;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
/** Slack mrkdwn: escape the three control characters so sponsor-supplied names cannot inject links or mentions. */
export function escapeSlack(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
/** Single-line text for a mail header (subject): no CR/LF or other control characters. */
// eslint-disable-next-line no-control-regex
const headerText = (s: string) => s.replace(/[\u0000-\u001F\u007F]+/g, " ").trim();
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const NOT_FOUND = () => new IntroError("NOT_FOUND", "Member not found.");

/** Validates the sponsor's request body. Plain text only: control characters (except newlines/tabs) are stripped. */
export function parseIntroInput(body: unknown): { memberId: string; message: string; opportunityId: string | null } {
  if (!isObj(body)) throw new IntroError("INVALID", "Body must be an object.");
  const memberId = typeof body.memberId === "string" ? body.memberId.trim() : "";
  if (!memberId || memberId.length > 64) throw new IntroError("INVALID", "memberId is required.");
  // eslint-disable-next-line no-control-regex
  const message = typeof body.message === "string" ? body.message.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim() : "";
  if (!message || message.length > MAX_MESSAGE) throw new IntroError("INVALID", `message is required (${MAX_MESSAGE} characters max).`);
  let opportunityId: string | null = null;
  if (body.opportunityId != null) {
    if (typeof body.opportunityId !== "string" || body.opportunityId.trim().length > MAX_OPPORTUNITY_ID) {
      throw new IntroError("INVALID", `opportunityId must be text (${MAX_OPPORTUNITY_ID} characters max).`);
    }
    opportunityId = body.opportunityId.trim() || null;
  }
  return { memberId, message, opportunityId };
}

/** Status as reported: a PENDING row past expiresAt is EXPIRED even before the write lands. */
export function effectiveStatus(row: Pick<IntroRow, "status" | "expiresAt">, now: Date): IntroStatus {
  return row.status === "PENDING" && row.expiresAt.getTime() < now.getTime() ? "EXPIRED" : row.status;
}

export function acceptEmailHtml(member: MemberContact, bullets: readonly string[], opportunityId: string | null): string {
  const lines = [
    `<p>${escapeHtml(member.displayName)} accepted your introduction request through the Purdue SEARCH sponsor portal.</p>`,
    member.email
      ? `<p>You can reach them at <a href="mailto:${escapeHtml(member.email)}">${escapeHtml(member.email)}</a>.</p>`
      : `<p>They have no email address on file; reply through the sponsor portal.</p>`,
  ];
  if (opportunityId) lines.push(`<p>Opportunity reference: ${escapeHtml(opportunityId)}</p>`);
  if (bullets.length) lines.push("<p>Highlights they chose to share:</p>", `<ul>${bullets.map(b => `<li>${escapeHtml(b)}</li>`).join("")}</ul>`);
  return lines.join("\n");
}

export function createIntroService(d: IntroDeps) {
  const now = () => new Date((d.now ?? Date.now)());

  async function card(memberId: string, disabled: string[]): Promise<{ card: SponsorCard; skillNames: string[] } | null> {
    const src = await d.store.cardSource(memberId);
    if (!src) return null;
    return { card: buildSponsorCard(src, { disabledMetrics: disabled, frontendUrl: d.frontendUrl() }), skillNames: [...(src.skillNames ?? [])] };
  }

  return {
    /** GET /api/sponsor/directory. Filters narrow; the sort is alphabetical (or graduation term, then name). */
    async directory(query: Record<string, unknown>): Promise<{ members: SponsorCard[] }> {
      let filters: DirectoryFilters;
      try { filters = parseDirectoryQuery(query); } catch (e) { throw new IntroError("INVALID", e instanceof Error ? e.message : "Invalid filter."); }
      const [ids, disabled] = await Promise.all([d.store.sharedMemberIds(), d.store.disabledMetrics()]);
      const built = await Promise.all(ids.map(id => card(id, disabled)));
      const members = built.flatMap(b => (b && matchesFilters(b.card, b.skillNames, filters) ? [b.card] : []));
      return { members: sortCards(members, filters.sort) };
    },

    /** POST /api/sponsor/intros. */
    async requestIntro(sponsor: SponsorUserRow, body: unknown): Promise<{ intro: ReturnType<typeof sponsorView> }> {
      const input = parseIntroInput(body);
      const member = await d.store.sharedMember(input.memberId);
      if (!member) throw NOT_FOUND();
      const t = now();
      const created = await d.store.createIntro(
        { sponsorUserId: sponsor.id, memberId: member.id, opportunityId: input.opportunityId, message: input.message,
          expiresAt: new Date(t.getTime() + INTRO_TTL_MS), createdAt: t },
        { since: new Date(t.getTime() - INTRO_WINDOW_MS), limit: INTRO_LIMIT, now: t },
      );
      if (created === "DUPLICATE") throw new IntroError("CONFLICT", "You already have a pending request with this member.");
      if (created === "RATE_LIMITED") throw new IntroError("RATE_LIMITED", `You can send at most ${INTRO_LIMIT} introduction requests per 7 days.`);
      const who = sponsor.name?.trim() ? `${sponsor.name.trim()} from ${sponsor.org.name}` : `Someone from ${sponsor.org.name}`;
      const link = `${d.frontendUrl().replace(/\/+$/, "")}${CAREER_PATH}`;
      const message = `${who} would like an introduction. Review the request in your Career view.`;
      try {
        await d.notify({
          recipientId: member.id,
          message,
          slackText: `${escapeSlack(message)} <${link}|Open Career>`,
          metadata: { introId: created.id, sponsorOrg: sponsor.org.name, link },
        });
      } catch (err) {
        console.error("[intro] notification failed:", err instanceof Error ? err.name : "error");
      }
      return { intro: sponsorView(created, member, t) };
    },

    /**
     * GET /api/sponsor/intros: own requests, newest first; memberEmail only when ACCEPTED.
     * A member who has since turned off shareWithSponsors (or left / was deactivated) is redacted on every row:
     * no id, no name, no email. Sharing off means the sponsor portal shows nothing about them.
     */
    async sponsorIntros(sponsorUserId: string) {
      const t = now();
      await d.store.expireDue(t, { sponsorUserId });
      const rows = await d.store.listForSponsor(sponsorUserId);
      const members = new Map<string, MemberContact | null>();
      await Promise.all([...new Set(rows.map(r => r.memberId))].map(async id => { members.set(id, await d.store.sharedMember(id)); }));
      return {
        intros: [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1))
          .map(r => sponsorView(r, members.get(r.memberId) ?? null, t)),
      };
    },

    /** GET /api/career/me/intros: own requests, newest first; sponsor email only after the member accepted. */
    async memberIntros(memberId: string) {
      const t = now();
      await d.store.expireDue(t, { memberId });
      const rows = await d.store.listForMember(memberId);
      return {
        intros: [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1)).map(r => {
          const status = effectiveStatus(r, t);
          return {
            id: r.id, status, message: r.message, opportunityId: r.opportunityId,
            createdAt: r.createdAt, expiresAt: r.expiresAt, respondedAt: r.respondedAt,
            sponsor: {
              name: r.sponsor.name, org: r.sponsor.org.name,
              ...(status === "ACCEPTED" ? { email: r.sponsor.email } : {}),
            },
          };
        }),
      };
    },

    /** POST /api/career/me/intros/:id { accept }. */
    async respond(memberId: string, id: string, body: unknown): Promise<{ ok: true; status: "ACCEPTED" | "DECLINED"; emailed: boolean }> {
      const accept = isObj(body) ? body.accept : undefined;
      if (typeof accept !== "boolean") throw new IntroError("INVALID", "accept must be true or false.");
      const row = await d.store.find(id);
      if (!row || row.memberId !== memberId) throw new IntroError("NOT_FOUND", "Request not found.");
      const t = now();
      if (effectiveStatus(row, t) !== "PENDING") {
        if (row.status === "PENDING") await d.store.expireDue(t, { memberId });
        throw new IntroError("CONFLICT", "This request has already been answered or has expired.");
      }
      if (accept && !isSponsorEligible(row.sponsor, t)) throw new IntroError("CONFLICT", "This sponsor no longer has portal access.");
      // Contact details go both ways only while the member shares with sponsors; declining is always allowed.
      if (accept && !(await d.store.sharedMember(memberId))) {
        throw new IntroError("CONFLICT", "Turn on sharing with sponsors before accepting an introduction.");
      }
      const status = accept ? "ACCEPTED" : "DECLINED";
      if (!(await d.store.respond(id, memberId, status, t))) throw new IntroError("CONFLICT", "This request has already been answered or has expired.");
      if (!accept) return { ok: true, status, emailed: false };

      let emailed = false;
      try {
        const [member, src, disabled] = await Promise.all([d.store.member(memberId), d.store.cardSource(memberId), d.store.disabledMetrics()]);
        if (member) {
          const bullets = src ? pickedBullets(src, disabled).map(b => b.text) : [];
          await d.mailer({
            to: row.sponsor.email,
            subject: headerText(`${member.displayName} accepted your introduction request`),
            html: acceptEmailHtml(member, bullets, row.opportunityId),
          });
          emailed = true;
        }
      } catch (err) {
        // The accept stands; the member still sees the sponsor's email in their inbox.
        console.error("[intro] accept email not sent:", err instanceof Error ? err.name : "error");
      }
      return { ok: true, status, emailed };
    },
  };
}
export type IntroService = ReturnType<typeof createIntroService>;

/** `member` is the shared-member contact, or null when the member no longer shares (then fully redacted). */
function sponsorView(r: IntroRow, member: MemberContact | null, t: Date) {
  const status = effectiveStatus(r, t);
  return {
    id: r.id, status, message: r.message, opportunityId: r.opportunityId,
    createdAt: r.createdAt, expiresAt: r.expiresAt, respondedAt: r.respondedAt,
    member: member ? { id: r.memberId as string | null, name: cardName(member.displayName), sharing: true } : { id: null, name: "Member no longer sharing", sharing: false },
    ...(status === "ACCEPTED" && member?.email ? { memberEmail: member.email } : {}),
  };
}

/** Maintenance half of expiry (called from runSponsorMaintenance). Never throws; logs the count only. */
export async function expireIntroRequests(now: Date = new Date(), store?: IntroStore): Promise<number> {
  try {
    const s = store ?? await getDefaultIntroStore();
    const n = await s.expireDue(now);
    if (n > 0) console.log(`[intro] marked ${n} introduction requests expired`);
    return n;
  } catch (err) {
    console.error("[intro] expiry sweep failed:", err instanceof Error ? err.name : "error");
    return 0;
  }
}

// ── Default deps (Prisma, createNotification, Resend) — loaded lazily so tests import no database ──

export async function defaultIntroNotify(n: Parameters<IntroNotify>[0]): Promise<unknown> {
  const { createNotification } = await import("./notificationCrud.js");
  return createNotification({ type: "CAREER_INTRO_REQUEST", ...n } as Parameters<typeof createNotification>[0]);
}

export async function defaultIntroMailer(msg: { to: string; subject: string; html: string }): Promise<void> {
  const { send } = await import("./emailService.js");
  await send(msg);
}

let defaultStoreP: Promise<IntroStore> | null = null;
export function getDefaultIntroStore(): Promise<IntroStore> {
  defaultStoreP ??= Promise.all([import("../db/prisma.js"), import("./careerStore.js")]).then(([{ prisma }, { prismaCareerStore: cs }]): IntroStore => {
    const sponsorSelect = {
      id: true, email: true, name: true, tokenVersion: true, disabledAt: true,
      org: { select: { id: true, name: true, active: true, accessUntil: true } },
    } as const;
    const introSelect = {
      id: true, sponsorUserId: true, memberId: true, opportunityId: true, message: true,
      status: true, respondedAt: true, expiresAt: true, createdAt: true,
    } as const;
    const sharedWhere = { isBot: false, deactivatedAt: null, careerProfile: { is: { shareWithSponsors: true } } };
    const contact = { id: true, displayName: true, email: true } as const;
    return {
      async sharedMemberIds() {
        return (await prisma.member.findMany({ where: sharedWhere, select: { id: true } })).map(m => m.id);
      },
      sharedMember: (memberId) => prisma.member.findFirst({ where: { id: memberId, ...sharedWhere }, select: contact }),
      member: (memberId) => prisma.member.findUnique({ where: { id: memberId }, select: contact }),
      async cardSource(memberId) {
        const m = await prisma.member.findUnique({ where: { id: memberId }, select: { id: true, displayName: true } });
        if (!m) return null;
        const [profile, targets, snapshots, attestations, bulletRows, certs, badges, skills] = await Promise.all([
          cs.profile(memberId), cs.targets(memberId), cs.snapshots(memberId), cs.attestations(memberId), cs.bulletRows(memberId),
          cs.certifications(memberId),
          prisma.badgeAward.findMany({ where: { memberId, revokedAt: null }, select: { id: true, achievementId: true }, orderBy: { issuedAt: "asc" } }),
          // Tool filter only: skills the member made public (SkillVisibility.isPublic), canonical, active, not
          // disputed, level >= 1. Matching on every inferred skill would let filters probe unshared skills.
          (async () => {
            const disputed = await prisma.skillDispute.findMany({ where: { memberId, status: { in: ["OPEN", "UPHELD"] } }, select: { skillId: true } });
            const pub = await prisma.skillVisibility.findMany({ where: { memberId, isPublic: true }, select: { skillId: true } });
            const allowed = pub.map(p => p.skillId).filter(id => !disputed.some(d => d.skillId === id));
            if (!allowed.length) return [] as { name: string }[];
            return (await prisma.skillAssessment.findMany({
              where: { memberId, level: { gt: 0 }, skillId: { in: allowed }, skill: { status: "ACTIVE", canonicalId: null } },
              select: { skill: { select: { name: true } } },
            })).map(r => ({ name: r.skill.name }));
          })(),
        ]);
        return {
          memberId: m.id, displayName: m.displayName, profile,
          targets: targets.map(t => ({ code: t.code, title: t.title })),
          snapshots, attestations, bulletRows,
          certifications: certs.map(c => ({ name: c.name, issuer: c.issuer })),
          badges, skillNames: [...new Set(skills.map(s => s.name))],
        };
      },
      disabledMetrics: () => cs.disabledMetrics(),
      async createIntro(row, rule) {
        return prisma.$transaction(async tx => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"intro:" + row.sponsorUserId}))`;
          const dup = await tx.introRequest.findFirst({
            where: { sponsorUserId: row.sponsorUserId, memberId: row.memberId, status: "PENDING", expiresAt: { gte: rule.now } }, select: { id: true },
          });
          if (dup) return "DUPLICATE" as const;
          const count = await tx.introRequest.count({ where: { sponsorUserId: row.sponsorUserId, createdAt: { gt: rule.since } } });
          if (count >= rule.limit) return "RATE_LIMITED" as const;
          return tx.introRequest.create({ data: row, select: introSelect }) as Promise<IntroRow>;
        });
      },
      listForSponsor: (sponsorUserId) => prisma.introRequest.findMany({ where: { sponsorUserId }, select: introSelect, orderBy: { createdAt: "desc" } }) as Promise<IntroRow[]>,
      listForMember: (memberId) => prisma.introRequest.findMany({
        where: { memberId }, select: { ...introSelect, sponsorUser: { select: sponsorSelect } }, orderBy: { createdAt: "desc" },
      }).then(rows => rows.map(({ sponsorUser, ...r }) => ({ ...(r as IntroRow), sponsor: sponsorUser }))),
      find: (id) => prisma.introRequest.findUnique({ where: { id }, select: { ...introSelect, sponsorUser: { select: sponsorSelect } } })
        .then(r => (r ? (({ sponsorUser, ...rest }) => ({ ...(rest as IntroRow), sponsor: sponsorUser }))(r) : null)),
      async respond(id, memberId, status, now) {
        const r = await prisma.introRequest.updateMany({
          where: { id, memberId, status: "PENDING", expiresAt: { gte: now } }, data: { status, respondedAt: now },
        });
        return r.count === 1;
      },
      async expireDue(now, scope = {}) {
        const r = await prisma.introRequest.updateMany({
          where: { status: "PENDING", expiresAt: { lt: now }, ...(scope.memberId ? { memberId: scope.memberId } : {}), ...(scope.sponsorUserId ? { sponsorUserId: scope.sponsorUserId } : {}) },
          data: { status: "EXPIRED" },
        });
        return r.count;
      },
    };
  });
  return defaultStoreP;
}
