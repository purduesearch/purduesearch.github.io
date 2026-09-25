export default function LabAvatar({ member, size = 20 }) {
  const name = member?.displayName ?? '?';
  const style = { width: size, height: size };
  if (member?.avatarUrl) {
    return <img className="pm-lab-avatar" src={member.avatarUrl} alt="" title={name} style={style} />;
  }
  return <span className="pm-lab-avatar" title={name} style={style} aria-hidden="true">{name[0].toUpperCase()}</span>;
}
