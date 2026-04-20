const SIZES = {
  sm: { size: '1.5rem', fontSize: '8px', ring: '1px' },
  md: { size: '2rem',   fontSize: '10px', ring: '2px' },
  lg: { size: '3rem',   fontSize: '0.875rem', ring: '2px' },
};

export default function MemberBadge({ member, size = 'md' }) {
  const s = SIZES[size];
  const initials = member.displayName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const avatarStyle = {
    width: s.size, height: s.size, borderRadius: '50%',
    outline: `${s.ring} solid var(--color-surface-100)`,
    objectFit: 'cover',
  };

  return (
    <div style={{ position: 'relative', display: 'inline-block' }} className="group">
      {member.avatarUrl ? (
        <img src={member.avatarUrl} alt={member.displayName} style={avatarStyle} />
      ) : (
        <div style={{
          ...avatarStyle,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: s.fontSize, fontWeight: 600, color: 'white',
          background: 'linear-gradient(135deg, var(--color-accent-primary), var(--color-accent-pink))',
        }}>
          {initials}
        </div>
      )}
      <div className="cpm-member-tooltip">
        {member.displayName}
        <div className="cpm-member-tooltip-arrow" />
      </div>
    </div>
  );
}
