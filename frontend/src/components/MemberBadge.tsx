import type { Member } from "../types";

interface MemberBadgeProps {
  member: Member;
  size?: "sm" | "md" | "lg";
}

const SIZES = {
  sm: { avatar: "w-6 h-6", text: "text-[8px]", ring: "ring-1" },
  md: { avatar: "w-8 h-8", text: "text-[10px]", ring: "ring-2" },
  lg: { avatar: "w-12 h-12", text: "text-sm", ring: "ring-2" },
};

export default function MemberBadge({ member, size = "md" }: MemberBadgeProps) {
  const s = SIZES[size];
  const initials = member.displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="group relative inline-block">
      {member.avatarUrl ? (
        <img
          src={member.avatarUrl}
          alt={member.displayName}
          className={`${s.avatar} rounded-full ${s.ring} ring-[var(--color-surface-100)] object-cover`}
        />
      ) : (
        <div
          className={`${s.avatar} rounded-full ${s.ring} ring-[var(--color-surface-100)] flex items-center justify-center font-semibold ${s.text}`}
          style={{
            background: `linear-gradient(135deg, var(--color-accent-primary), var(--color-accent-pink))`,
            color: "white",
          }}
        >
          {initials}
        </div>
      )}
      {/* Tooltip */}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 rounded-md bg-[var(--color-surface-400)] text-[var(--color-text-primary)] text-[10px] font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
        {member.displayName}
        <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-[var(--color-surface-400)]" />
      </div>
    </div>
  );
}
