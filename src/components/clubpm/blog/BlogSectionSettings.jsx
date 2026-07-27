import React from 'react';
import useImageUpload from './useImageUpload';

const SEG = (opts, value, onPick) => (
  <div className="cpm-blog-seg">
    {opts.map(([v, label]) => (
      <button key={v} type="button" className={`cpm-blog-seg-b${value === v ? ' on' : ''}`} onClick={() => onPick(v)}>{label}</button>
    ))}
  </div>
);

export default function BlogSectionSettings({ editor, pos, onClose }) {
  const [attrs, setAttrs] = React.useState(null);
  // Must stay above the `if (!attrs) return null` early return.
  const { busy: uploading, pickImage } = useImageUpload();

  // Always resolve from the current pos — the panel now follows the caret, so a
  // stale `attrs` from a previously selected section would silently edit the
  // wrong node. Clearing on a miss makes the panel disappear instead.
  React.useEffect(() => {
    if (!editor || pos == null) { setAttrs(null); return; }
    const node = editor.state.doc.nodeAt(pos);
    setAttrs(node && node.type.name === 'section' ? { ...node.attrs } : null);
  }, [editor, pos]);

  if (!attrs) return null;
  const update = (patch) => {
    const next = { ...attrs, ...patch };
    setAttrs(next);
    editor.chain().command(({ tr }) => { tr.setNodeMarkup(pos, undefined, next); return true; }).run();
  };
  const bg = attrs.background || { kind: 'none', value: '' };
  const pickBackground = async () => {
    const upload = await pickImage();
    if (upload) update({ background: { kind: 'image', value: upload.url } });
  };

  return (
    <div className="cpm-blog-secset" role="dialog" aria-label="Section settings">
      <div className="cpm-blog-secset-head"><span>Section settings</span>
        <button type="button" className="cpm-blog-tb-btn" onClick={onClose}><i className="fas fa-xmark" /></button></div>

      <label className="cpm-blog-secset-lab">Layout</label>
      {SEG([['single','1 col'],['mediaText','Media+text'],['cols2','2 col'],['cols3','3 col']], attrs.layout, (v) => update({ layout: v }))}

      <label className="cpm-blog-secset-lab">Background</label>
      {SEG([['none','None'],['color','Color'],['image','Image']], bg.kind, (v) => update({ background: { kind: v, value: v === 'none' ? '' : bg.value } }))}
      {bg.kind === 'color' && (
        <input
          type="color"
          className="cpm-blog-secset-color"
          value={bg.value || '#111111'}
          onChange={(e) => update({ background: { kind: 'color', value: e.target.value } })}
        />
      )}
      {bg.kind === 'image' && (
        <div className="cpm-blog-secset-imgrow">
          <input
            className="cpm-blog-secset-input"
            placeholder="Image URL"
            value={bg.value || ''}
            onChange={(e) => update({ background: { kind: 'image', value: e.target.value } })}
          />
          <button type="button" className="clubpm-btn-secondary cpm-blog-img-src-btn" onClick={pickBackground} disabled={uploading}>
            {uploading ? 'Uploading…' : (bg.value ? 'Replace' : 'Upload')}
          </button>
          {bg.value ? (
            <button type="button" className="cpm-blog-tb-btn" title="Remove background image" onClick={() => update({ background: { kind: 'image', value: '' } })}>
              <i className="fas fa-xmark" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      )}

      <label className="cpm-blog-secset-lab">Padding</label>
      {SEG([['s','S'],['m','M'],['l','L'],['xl','XL']], attrs.padding, (v) => update({ padding: v }))}

      <label className="cpm-blog-secset-lab">Width</label>
      {SEG([['contained','Contained'],['fullBleed','Full-bleed']], attrs.width, (v) => update({ width: v }))}

      <label className="cpm-blog-secset-lab">Section theme</label>
      {SEG([['inherit','Inherit'],['light','Light'],['dark','Dark']], attrs.theme, (v) => update({ theme: v }))}
    </div>
  );
}
