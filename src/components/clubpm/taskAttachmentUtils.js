import { parseDriveUrl, getTypeMeta } from '../../utils/driveUtils';
import { SITE_URL } from '../../seo/siteUrl';

export function attachmentMeta(url) {
  try {
    const parsed = new URL(url, SITE_URL);
    if (parsed.searchParams.has('vaultItem')) return { icon: 'fa-cube', label: 'Vault', color: '#a78bfa', preview: false };
    if (parsed.hostname === 'github.com') {
      const kind = parsed.pathname.includes('/issues/') ? ['fa-circle-dot', 'Issue']
        : parsed.pathname.includes('/tree/') ? ['fa-code-branch', 'Branch']
        : parsed.pathname.includes('/blob/') ? ['fa-file-code', 'File'] : ['fa-code', 'Repo'];
      return { icon: kind[0], label: kind[1], color: 'var(--clubpm-text-secondary)', preview: false };
    }
    const drive = ['drive.google.com', 'docs.google.com'].includes(parsed.hostname) ? parseDriveUrl(url) : { kind: 'unknown' };
    return { ...getTypeMeta(drive.kind), preview: drive.kind !== 'unknown' };
  } catch { return { ...getTypeMeta('unknown'), preview: false }; }
}

export function vaultAttachment(projectId, item) {
  return {
    url: `${SITE_URL}/clubpm/projects/${encodeURIComponent(projectId)}?tab=files&sub=vault&vaultItem=${encodeURIComponent(item.id)}`,
    label: item.name || item.partNumber || item.latestVersion?.fileName || 'CAD file',
  };
}
