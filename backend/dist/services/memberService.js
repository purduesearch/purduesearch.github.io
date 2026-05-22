import { prisma } from "../db/prisma.js";
export async function resolveSlackMember(slackUserId, client) {
    const existing = await prisma.member.findUnique({
        where: { slackId: slackUserId },
    });
    // Fast path: existing member and no client → can't refresh anything.
    if (existing && !client)
        return existing;
    let displayName = existing?.displayName ?? slackUserId;
    let slackHandle = existing?.slackHandle ?? slackUserId;
    let avatarUrl = existing?.avatarUrl ?? undefined;
    // Slackbot is hard-coded as a bot — its slackId is constant across workspaces.
    let isBot = existing?.isBot ?? (slackUserId === "USLACKBOT");
    let title;
    let email;
    let timezone;
    if (client) {
        try {
            const userInfo = await client.users.info({ user: slackUserId });
            if (userInfo.user) {
                displayName = userInfo.user.real_name || existing?.displayName || slackUserId;
                slackHandle = userInfo.user.name || existing?.slackHandle || slackUserId;
                avatarUrl = userInfo.user.profile?.image_72 ?? avatarUrl;
                isBot = Boolean(userInfo.user.is_bot) || slackUserId === "USLACKBOT";
                title = userInfo.user.profile?.title || undefined;
                email = userInfo.user.profile?.email || undefined;
                timezone = userInfo.user.tz || undefined;
            }
        }
        catch {
            // Silently fall back to defaults if Slack API call fails
        }
    }
    return prisma.member.upsert({
        where: { slackId: slackUserId },
        update: {
            displayName, slackHandle, avatarUrl, isBot,
            ...(title !== undefined ? { title } : {}),
            ...(email !== undefined ? { email } : {}),
            ...(timezone !== undefined ? { timezone } : {}),
        },
        create: { slackId: slackUserId, slackHandle, displayName, avatarUrl, isBot, title, email, timezone },
    });
}
export async function updateMemberProfile(memberId, data) {
    return prisma.member.update({
        where: { id: memberId },
        data: {
            ...(data.team !== undefined ? { team: data.team } : {}),
            ...(data.bio !== undefined ? { bio: data.bio } : {}),
            ...(data.email !== undefined ? { email: data.email } : {}),
        },
    });
}
// Resolve a channel name like "leadership" or "#leadership" to a Slack channel ID.
// Accepts a WebClient directly so callers don't need the full App object.
// Slack channel IDs start with C (public) or G (private/group).
async function resolveChannelId(client, nameOrId) {
    if (/^[CG]/i.test(nameOrId))
        return nameOrId;
    const target = nameOrId.replace(/^#/, "").toLowerCase();
    let cursor;
    do {
        const res = await client.conversations.list({
            types: "public_channel,private_channel",
            exclude_archived: true,
            limit: 200,
            ...(cursor ? { cursor } : {}),
        });
        const match = res.channels?.find(c => c.name?.toLowerCase() === target);
        if (match?.id)
            return match.id;
        cursor = res.response_metadata?.next_cursor || undefined;
    } while (cursor);
    return null;
}
// Cached after first resolution so member_joined/left events don't call conversations.list repeatedly.
let _leadershipChannelId = undefined;
export async function getLeadershipChannelId(client) {
    if (_leadershipChannelId !== undefined)
        return _leadershipChannelId;
    const raw = process.env.LEADERSHIP_CHANNEL_ID;
    if (!raw)
        return (_leadershipChannelId = null);
    _leadershipChannelId = await resolveChannelId(client, raw);
    return _leadershipChannelId;
}
export async function syncAdminStatus(app) {
    const raw = process.env.LEADERSHIP_CHANNEL_ID;
    if (!raw)
        return;
    const channelId = await getLeadershipChannelId(app.client);
    if (!channelId) {
        console.error(`⚠️  syncAdminStatus: could not find Slack channel "${raw}"`);
        return;
    }
    const slackIds = [];
    let cursor;
    do {
        const res = await app.client.conversations.members({ channel: channelId, limit: 200, ...(cursor ? { cursor } : {}) });
        slackIds.push(...(res.members ?? []));
        cursor = res.response_metadata?.next_cursor || undefined;
    } while (cursor);
    // Ensure every leadership-channel member exists in the DB before granting admin.
    // After a workspace migration the Member table may be empty (slackIds are new), and
    // without this loop updateMany would match zero rows and grant no admin.
    for (const id of slackIds) {
        await resolveSlackMember(id, app.client);
    }
    // Snapshot current state so we can log what actually changed
    const existing = await prisma.member.findMany({
        select: { slackId: true, displayName: true, isAdmin: true },
    });
    const existingMap = new Map(existing.map(m => [m.slackId, m]));
    const gained = slackIds.filter(id => existingMap.has(id) && !existingMap.get(id).isAdmin);
    const lost = existing.filter(m => m.isAdmin && !slackIds.includes(m.slackId));
    await prisma.member.updateMany({ where: { slackId: { in: slackIds }, isBot: false }, data: { isAdmin: true } });
    await prisma.member.updateMany({ where: { slackId: { notIn: slackIds }, isAdmin: true }, data: { isAdmin: false } });
    // Bots never get admin, even if they're in #leadership.
    await prisma.member.updateMany({ where: { isBot: true, isAdmin: true }, data: { isAdmin: false } });
    for (const id of gained) {
        const name = existingMap.get(id)?.displayName ?? id;
        console.log(`🔑 [admin] GRANTED: ${name} (${id})`);
    }
    for (const m of lost) {
        console.log(`🔒 [admin] REVOKED: ${m.displayName} (${m.slackId})`);
    }
    if (gained.length === 0 && lost.length === 0) {
        console.log(`🔑 [admin] No admin status changes (${slackIds.length} members in leadership channel)`);
    }
}
export async function isAdminBySlackId(slackId) {
    const m = await prisma.member.findUnique({ where: { slackId }, select: { isAdmin: true } });
    return m?.isAdmin ?? false;
}
// Cached after first call — the bot's own Slack user ID, used to check channel
// membership and to invite the bot into a private channel via the user token.
let _botUserId = undefined;
export async function getBotUserId(client) {
    if (_botUserId !== undefined)
        return _botUserId;
    try {
        const res = await client.auth.test();
        _botUserId = res.user_id ?? null;
    }
    catch (err) {
        console.error("getBotUserId: auth.test failed:", err);
        _botUserId = null;
    }
    return _botUserId;
}
//# sourceMappingURL=memberService.js.map