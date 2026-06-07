// Cached avatar portrait. Renders an <img> (NOT a WebGL canvas), so this is
// safe to use in lists and headers. Fallback chain:
//   1. member.avatarConfig.portraitUrl  (VRM snapshot, written on Save)
//   2. member.avatarUrl                 (Slack profile photo)
//   3. initials block                   (last resort)
//
// The portraitUrl is a path beginning with "/uploads/..." served by the
// backend; cross-origin fetch is fine because we serve it from the same
// origin (or with the same CORS as the API).

import { useState } from "react";

function initialsFor(displayName) {
  if (!displayName) return "??";
  return displayName
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function AvatarPortrait({
  member,
  size = 36,
  rounded = true,
  className = "",
  style = {},
  alt,
}) {
  const [portraitFailed, setPortraitFailed] = useState(false);
  const [slackFailed,    setSlackFailed]    = useState(false);

  const portraitUrl = member?.avatarConfig?.portraitUrl ?? member?.portraitUrl ?? null;
  const slackUrl    = member?.avatarUrl ?? null;
  const initials    = initialsFor(member?.displayName);
  const label       = alt ?? member?.displayName ?? "";

  const baseStyle = {
    width:        size,
    height:       size,
    borderRadius: rounded ? "50%" : 6,
    flexShrink:   0,
    ...style,
  };

  if (portraitUrl && !portraitFailed) {
    return (
      <img
        src={portraitUrl}
        alt={label}
        className={className}
        style={{ ...baseStyle, objectFit: "cover" }}
        onError={() => setPortraitFailed(true)}
      />
    );
  }

  if (slackUrl && !slackFailed) {
    return (
      <img
        src={slackUrl}
        alt={label}
        className={className}
        style={{ ...baseStyle, objectFit: "cover" }}
        onError={() => setSlackFailed(true)}
      />
    );
  }

  return (
    <div
      className={className}
      aria-label={label}
      style={{
        ...baseStyle,
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        fontWeight:     600,
        fontSize:       Math.max(10, Math.round(size * 0.4)),
        color:          "white",
        background:     "linear-gradient(135deg, var(--clubpm-accent-primary, #0ea5e9), var(--clubpm-accent-pink, #e879f9))",
      }}
    >
      {initials}
    </div>
  );
}
