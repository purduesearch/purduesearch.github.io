import React from 'react';
import { createRoot } from 'react-dom/client';
import toast from 'react-hot-toast';
import {
  listPhotoAlbums, addPhotoAlbum, removePhotoAlbum, getPhotoAlbumPhotos, importAlbumPhotos,
} from '../../../api/clubPmClient';

// Photo album picker (backend: backend/src/api/photoAlbums.ts).
//
// The club's Google Photos albums are added once by share link and are then
// available to every member — no Google sign-in. Thumbnails load straight
// from Google; the import copies the chosen photos into Constellation's own
// image store, so posts never depend on the album staying shared.

const MAX_IMPORT = 30;

function summarize(result, target) {
  const n = result?.images?.length || 0;
  const parts = [];
  if (result?.missing) parts.push(`${result.missing} no longer in the album`);
  if (result?.failed) parts.push(`${result.failed} failed to copy`);
  if (!n) {
    toast.error(parts.length ? `No photos imported (${parts.join(', ')}).` : 'No photos were imported.');
    return;
  }
  const where = target === 'asset' ? ' to the Asset Library' : '';
  const msg = `Imported ${n} photo${n === 1 ? '' : 's'}${where}.`;
  if (parts.length) toast(`${msg} ${parts.join(', ')}.`);
  else toast.success(msg);
}

function AddAlbumForm({ onAdded }) {
  const [url, setUrl] = React.useState('');
  const [title, setTitle] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(null);
  const inFlight = React.useRef(false);

  const submit = async (e) => {
    e.preventDefault();
    if (inFlight.current || !url.trim()) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const album = await addPhotoAlbum(url.trim(), title.trim() || undefined);
      if (album.alreadyAdded) toast(`"${album.title}" was already added.`);
      setUrl('');
      setTitle('');
      onAdded(album);
    } catch (err) {
      setError(err?.message || 'Could not add that album.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <form className="pm-albums-add" onSubmit={submit}>
      <div className="pm-albums-add-row">
        <input
          type="url"
          className="cpm-form-input pm-albums-add-url"
          placeholder="https://photos.app.goo.gl/…"
          aria-label="Shared album link"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={busy}
        />
        <input
          type="text"
          className="cpm-form-input pm-albums-add-title"
          placeholder="Name (optional)"
          aria-label="Album name (optional)"
          maxLength={120}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={busy}
        />
        <button type="submit" className="clubpm-btn-primary" disabled={busy || !url.trim()}>
          {busy ? 'Checking…' : 'Add album'}
        </button>
      </div>
      <p className="pm-albums-hint">
        In Google Photos, open the album, choose <strong>Share → Create link</strong>, and paste the link here.
        Anyone with the link can view the album, so only add albums meant for the club.
      </p>
      {error && <p className="pm-albums-error" role="alert">{error}</p>}
    </form>
  );
}

function AlbumList({ albums, onOpen, onAdded, onRemove }) {
  return (
    <>
      <AddAlbumForm onAdded={onAdded} />
      {albums.length === 0 ? (
        <p className="pm-albums-empty">No albums yet. Paste a shared album link above to add the first one.</p>
      ) : (
        <ul className="pm-albums-grid">
          {albums.map((a) => (
            <li key={a.id} className="pm-albums-card">
              <button type="button" className="pm-albums-card-open" onClick={() => onOpen(a)}>
                {a.coverThumbUrl
                  ? <img src={a.coverThumbUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />
                  : <span className="pm-albums-card-blank"><i className="fas fa-images" aria-hidden="true" /></span>}
                <span className="pm-albums-card-title">{a.title}</span>
                <span className="pm-albums-card-meta">
                  {a.photoCount != null ? `${a.photoCount} photo${a.photoCount === 1 ? '' : 's'}` : 'Album'}
                  {a.addedBy?.displayName ? ` · added by ${a.addedBy.displayName}` : ''}
                </span>
              </button>
              {a.canRemove && (
                <button type="button" className="pm-albums-card-remove" onClick={() => onRemove(a)} aria-label={`Remove ${a.title}`} title="Remove album">
                  <i className="fas fa-trash" aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function PhotoGrid({ photos, selected, onToggle }) {
  if (photos.length === 0) return <p className="pm-albums-empty">This album has no photos.</p>;
  return (
    <ul className="pm-albums-photos">
      {photos.map((p) => {
        const order = selected.indexOf(p.id);
        const isOn = order >= 0;
        return (
          <li key={p.id}>
            <button
              type="button"
              className={`pm-albums-photo${isOn ? ' is-selected' : ''}`}
              aria-pressed={isOn}
              aria-label={`${p.isVideo ? 'Video' : 'Photo'}${p.takenAt ? ` from ${new Date(p.takenAt).toLocaleDateString()}` : ''}`}
              onClick={() => onToggle(p.id)}
            >
              <img src={p.thumbUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />
              {p.isVideo && <span className="pm-albums-photo-video" title="Video — imports a still frame"><i className="fas fa-video" aria-hidden="true" /></span>}
              {isOn && <span className="pm-albums-photo-check">{selected.length > 1 ? order + 1 : <i className="fas fa-check" aria-hidden="true" />}</span>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function PickerDialog({ options, onDone }) {
  const { target = 'blog', tags } = options;
  const maxItems = Math.max(1, Math.min(MAX_IMPORT, options.maxItems || 1));
  // albums → photos → importing; `error` shows inline in whichever view is open.
  const [view, setView] = React.useState('albums');
  const [albums, setAlbums] = React.useState(null);
  const [album, setAlbum] = React.useState(null);
  const [photos, setPhotos] = React.useState(null);
  const [truncated, setTruncated] = React.useState(false);
  const [selected, setSelected] = React.useState([]);
  const [error, setError] = React.useState(null);
  const finishedRef = React.useRef(false);
  const importing = React.useRef(false);
  const dialogRef = React.useRef(null);
  const openSeq = React.useRef(0);

  const finish = React.useCallback((value) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    onDone(value);
  }, [onDone]);
  const cancel = React.useCallback(() => { if (!importing.current) finish(null); }, [finish]);

  React.useEffect(() => {
    listPhotoAlbums()
      .then(setAlbums)
      .catch((err) => { setAlbums([]); setError(err?.message || 'Could not load albums.'); });
  }, []);

  const loadPhotos = React.useCallback(async (a, refresh = false) => {
    const seq = ++openSeq.current;
    setPhotos(null);
    setError(null);
    try {
      const res = await getPhotoAlbumPhotos(a.id, { refresh });
      if (seq !== openSeq.current) return;
      setPhotos(res.photos || []);
      setTruncated(Boolean(res.truncated));
      setAlbums((prev) => prev?.map((x) => (x.id === a.id ? { ...x, ...res.album } : x)) ?? prev);
    } catch (err) {
      if (seq !== openSeq.current) return;
      setPhotos([]);
      setError(err?.message || 'Could not read this album.');
    }
  }, []);

  const openAlbum = (a) => {
    setAlbum(a);
    setSelected([]);
    setView('photos');
    loadPhotos(a);
  };
  const backToAlbums = () => {
    openSeq.current++;
    setView('albums');
    setAlbum(null);
    setPhotos(null);
    setSelected([]);
    setError(null);
  };

  const onAdded = (a) => {
    setAlbums((prev) => [a, ...(prev || []).filter((x) => x.id !== a.id)]);
    openAlbum(a);
  };
  const onRemove = async (a) => {
    if (!window.confirm(`Remove "${a.title}" from Constellation? Photos already imported stay where they are.`)) return;
    try {
      await removePhotoAlbum(a.id);
      setAlbums((prev) => prev.filter((x) => x.id !== a.id));
    } catch (err) {
      toast.error(err?.message || 'Could not remove the album.');
    }
  };

  const toggle = (id) => {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (maxItems === 1) return [id];
      if (prev.length >= maxItems) {
        toast(`You can pick up to ${maxItems} photos at a time.`);
        return prev;
      }
      return [...prev, id];
    });
  };

  const runImport = async () => {
    if (importing.current || !selected.length || !album) return;
    importing.current = true;
    setView('importing');
    setError(null);
    try {
      const result = await importAlbumPhotos(album.id, { photoIds: selected, target, tags });
      summarize(result, target);
      importing.current = false;
      if (result.images?.length) finish(result);
      else setView('photos');
    } catch (err) {
      importing.current = false;
      setError(err?.message || 'Import failed.');
      setView('photos');
    }
  };

  // Capture phase + stopImmediatePropagation: this dialog usually opens on top
  // of another modal (Asset Library, blog meta panel) whose own Escape handler
  // would otherwise close it too.
  React.useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      cancel();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [cancel]);

  React.useEffect(() => { dialogRef.current?.focus(); }, [view]);

  let body;
  if (view === 'importing') {
    body = (
      <p className="pm-albums-status">
        <span className="cpm-spinner pm-albums-spinner" aria-hidden="true" />
        Copying {selected.length} photo{selected.length === 1 ? '' : 's'} into Constellation…
      </p>
    );
  } else if (view === 'photos') {
    body = photos === null
      ? <p className="pm-albums-status"><span className="cpm-spinner pm-albums-spinner" aria-hidden="true" /> Loading photos…</p>
      : (
        <>
          {truncated && <p className="pm-albums-hint">Showing the first {photos.length} photos of this album.</p>}
          <PhotoGrid photos={photos} selected={selected} onToggle={toggle} />
        </>
      );
  } else {
    body = albums === null
      ? <p className="pm-albums-status"><span className="cpm-spinner pm-albums-spinner" aria-hidden="true" /> Loading albums…</p>
      : <AlbumList albums={albums} onOpen={openAlbum} onAdded={onAdded} onRemove={onRemove} />;
  }

  let pickLabel = 'Import photos';
  if (maxItems === 1) pickLabel = 'Use photo';
  else if (selected.length) pickLabel = `Import ${selected.length} photo${selected.length === 1 ? '' : 's'}`;

  return (
    <div className="pm-albums-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) cancel(); }}>
      <div className="pm-albums-dialog" role="dialog" aria-modal="true" aria-labelledby="pm-albums-title" tabIndex={-1} ref={dialogRef}>
        <div className="pm-albums-head">
          {view === 'photos' && (
            <button type="button" className="pm-albums-back" onClick={backToAlbums} aria-label="All albums" title="All albums">
              <i className="fas fa-arrow-left" aria-hidden="true" />
            </button>
          )}
          <h2 id="pm-albums-title" className="pm-albums-title">
            <i className="fas fa-images" aria-hidden="true" />
            <span>{view === 'albums' ? 'Photo albums' : album?.title}</span>
          </h2>
          {view === 'photos' && album && (
            <div className="pm-albums-head-actions">
              <button type="button" className="pm-albums-icon-btn" onClick={() => loadPhotos(album, true)} disabled={photos === null} aria-label="Refresh album" title="Refresh album">
                <i className="fas fa-arrows-rotate" aria-hidden="true" />
              </button>
              <a className="pm-albums-icon-btn" href={album.shareUrl} target="_blank" rel="noopener noreferrer" aria-label="Open in Google Photos" title="Open in Google Photos">
                <i className="fas fa-arrow-up-right-from-square" aria-hidden="true" />
              </a>
            </div>
          )}
          {view !== 'importing' && (
            <button type="button" className="pm-copy-close-btn" onClick={cancel} aria-label="Close">
              <i className="fas fa-xmark" aria-hidden="true" />
            </button>
          )}
        </div>
        {error && view !== 'albums' && <p className="pm-albums-error" role="alert">{error}</p>}
        {error && view === 'albums' && albums?.length === 0 && <p className="pm-albums-error" role="alert">{error}</p>}
        <div className="pm-albums-body" aria-live="polite">{body}</div>
        {view === 'photos' && (
          <div className="pm-albums-actions">
            <span className="pm-albums-count">
              {maxItems > 1 ? `${selected.length} of up to ${maxItems} selected` : (selected.length ? '1 selected' : 'Pick a photo')}
            </span>
            <button type="button" className="clubpm-btn-secondary" onClick={cancel}>Cancel</button>
            <button type="button" className="clubpm-btn-primary" onClick={runImport} disabled={!selected.length}>{pickLabel}</button>
          </div>
        )}
      </div>
    </div>
  );
}

let activeFlow = null;

/**
 * Let the member pick photos from the club's shared albums and copy them in.
 *
 * @param {{ maxItems?: number, target?: 'blog'|'asset', tags?: string[] }} options
 * @returns {Promise<null | { images: {url,width,height,photoId}[], assets?: object[], missing: number, failed: number }>}
 *          null when cancelled or nothing was imported.
 */
export function pickFromAlbums(options = {}) {
  if (activeFlow) return activeFlow;
  activeFlow = new Promise((resolve) => {
    const host = document.createElement('div');
    host.className = 'clubpm-portal';
    document.body.appendChild(host);
    const root = createRoot(host);
    const onDone = (value) => {
      activeFlow = null;
      // Unmount after the current render pass finishes.
      setTimeout(() => { root.unmount(); host.remove(); }, 0);
      resolve(value);
    };
    root.render(<PickerDialog options={options} onDone={onDone} />);
  });
  return activeFlow;
}

/** Button that runs the picker and hands the result to onPicked. */
export function AlbumPhotosButton({ onPicked, maxItems = 1, target = 'blog', tags, className = 'clubpm-btn-secondary', label = 'Photo albums', disabled, title }) {
  const [busy, setBusy] = React.useState(false);
  const mounted = React.useRef(true);
  React.useEffect(() => () => { mounted.current = false; }, []);
  const onClick = () => {
    setBusy(true);
    pickFromAlbums({ maxItems, target, tags })
      .then((result) => { if (result) onPicked(result); })
      .finally(() => { if (mounted.current) setBusy(false); });
  };
  return (
    <button type="button" className={className} onClick={onClick} disabled={disabled || busy} title={title || 'Pick from the club photo albums'}>
      <i className="fas fa-images" aria-hidden="true" style={{ marginRight: 6 }} />
      {label}
    </button>
  );
}
