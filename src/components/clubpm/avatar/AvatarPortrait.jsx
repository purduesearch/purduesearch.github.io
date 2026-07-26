// Member avatar. Renders an <img> (NOT a WebGL canvas), so this is safe to use
// in lists and headers. Fallback chain:
//   1. member.avatarUrl  (Slack profile photo)
//   2. initials block    (last resort)

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
  const [slackFailed, setSlackFailed] = useState(false);

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
