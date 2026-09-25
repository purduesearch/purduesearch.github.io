import { useRef } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import toast from 'react-hot-toast';

// Printable check-in QR code for one lab space. The code opens
// /clubpm/lab/:id (LabScanPage), where members tap to check in or out.

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fileSlug = (s) => s.trim().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'lab';

export function labCheckInUrl(workspaceId) {
  return `${window.location.origin}/clubpm/lab/${encodeURIComponent(workspaceId)}`;
}

export default function LabCheckInQr({ space }) {
  const wrap = useRef(null);
  const url = labCheckInUrl(space.id);
  const canvas = () => wrap.current?.querySelector('canvas');

  function download() {
    const c = canvas();
    if (!c) return;
    const a = document.createElement('a');
    a.href = c.toDataURL('image/png');
    a.download = `${fileSlug(space.name)}-check-in-qr.png`;
    a.click();
  }

  function print() {
    const c = canvas();
    if (!c) return;
    const w = window.open('', '_blank', 'width=640,height=800');
    if (!w) { toast.error('Allow pop-ups to print the QR code.'); return; }
    const name = escapeHtml(space.name);
    w.document.write(`<!doctype html><html><head><title>${name} check-in</title>
<style>body{font-family:system-ui,sans-serif;text-align:center;margin:48px 24px;color:#000}
h1{font-size:40px;margin:0 0 8px}p{font-size:20px;margin:0 0 28px}img{width:420px;max-width:100%;image-rendering:pixelated}
small{display:block;margin-top:20px;font-size:13px;color:#444;word-break:break-all}</style></head>
<body><h1>${name}</h1>${space.location ? `<p>${escapeHtml(space.location)}</p>` : '<p></p>'}
<p><strong>Scan to check in or out of the lab</strong></p>
<img src="${c.toDataURL('image/png')}" alt="Check-in QR code" />
<small>${escapeHtml(url)}</small></body></html>`);
    w.document.close();
    w.onload = () => { w.focus(); w.print(); };
  }

  async function copy() {
    try { await navigator.clipboard.writeText(url); toast.success('Link copied'); }
    catch { toast.error('Could not copy the link.'); }
  }

  return (
    <div className="cpm-form-field is-wide">
      <span className="cpm-form-label">Check-in QR code</span>
      <div className="pm-lab-qr">
        <div ref={wrap} className="pm-lab-qr-code">
          <QRCodeCanvas value={url} size={512} level="M" marginSize={2} bgColor="#ffffff" fgColor="#000000"
            title={`Check-in QR code for ${space.name}`} />
        </div>
        <div className="pm-lab-qr-side">
          <span className="pm-lab-form-hint">Post this in the space. Members scan it with their phone camera, sign in once, and tap to check in or out.</span>
          <div className="pm-lab-qr-actions">
            <button type="button" className="cpm-btn cpm-btn-ghost" onClick={print}><i className="fas fa-print" aria-hidden="true" /> Print</button>
            <button type="button" className="cpm-btn cpm-btn-ghost" onClick={download}><i className="fas fa-download" aria-hidden="true" /> Download PNG</button>
            <button type="button" className="cpm-btn cpm-btn-ghost" onClick={copy}><i className="fas fa-link" aria-hidden="true" /> Copy link</button>
          </div>
        </div>
      </div>
    </div>
  );
}
