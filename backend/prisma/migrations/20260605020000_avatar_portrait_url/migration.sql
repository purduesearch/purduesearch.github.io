-- Phase 3 of the VRM overhaul: cache a snapshot URL on AvatarConfig so list
-- views (members, leaderboard, etc.) can render an <img> instead of mounting
-- a WebGL canvas per member.

ALTER TABLE "AvatarConfig" ADD COLUMN "portraitUrl" TEXT;
