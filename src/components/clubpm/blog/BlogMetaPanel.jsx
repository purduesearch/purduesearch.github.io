import React, { useState, useEffect, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import AssetPicker from '../AssetPicker';
import BlogCardPanel from './BlogCardPanel';
import {
  listBlogTags, createBlogTag, listBlogCategories, createBlogCategory,
  setBlogTaxonomy, uploadBlogImage,
} from '../../../api/clubPmClient';

const META_DESC_TARGET = 160;

function slugify(input) {
  return (
    (input || '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'post'
  );
}

function CoverImageField({ label, value, onChange }) {
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const { url } = await uploadBlogImage(file);
      onChange(url);
    } catch (err) {
      toast.error(err.message ?? 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="cpm-blog-meta-field">
      <label className="cpm-form-label">{label}</label>
      <div className="cpm-blog-meta-cover">
        {value ? (
          <img src={value} alt="Cover" className="cpm-blog-meta-cover-thumb" />
        ) : (
          <div className="cpm-blog-meta-cover-thumb cpm-blog-meta-cover-thumb--empty">
            <i className="fas fa-image" aria-hidden="true" />
          </div>
        )}
        <div className="cpm-blog-meta-cover-actions">
          <button type="button" className="clubpm-btn-secondary" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            {uploading ? 'Uploading…' : 'Upload'}
          </button>
          <button type="button" className="clubpm-btn-secondary" onClick={() => setPickerOpen(true)}>
            Library
          </button>
          {value && (
            <button type="button" className="clubpm-btn-secondary" onClick={() => onChange(null)}>
              Remove
            </button>
          )}
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />
      </div>
      <AssetPicker
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={(asset) => { onChange(asset.url); setPickerOpen(false); }}
        title="Choose Cover Image"
      />
    </div>
  );
}

export default function BlogMetaPanel({ post, title, onUpdate, isOpen, onClose }) {
  const [slug, setSlug] = useState(post?.slug ?? '');
  const [slugSaving, setSlugSaving] = useState(false);
  const [metaDescription, setMetaDescription] = useState(post?.metaDescription ?? '');
  const [canonicalUrl, setCanonicalUrl] = useState(post?.canonicalUrl ?? '');
  const [ogTitle, setOgTitle] = useState(post?.ogTitle ?? '');
  const [ogDescription, setOgDescription] = useState(post?.ogDescription ?? '');
  const [ogImageUrl, setOgImageUrl] = useState(post?.ogImageUrl ?? '');
  const [coverImageUrl, setCoverImageUrl] = useState(post?.coverImageUrl ?? '');
  const [authorName, setAuthorName] = useState(post?.authorName ?? '');
  const [excerpt, setExcerpt] = useState(post?.excerpt ?? '');
  const [linkUrl, setLinkUrl] = useState(post?.linkUrl ?? '');
  const [publishedAt, setPublishedAt] = useState(post?.publishedAt ? post.publishedAt.slice(0, 10) : '');
  const [allTags, setAllTags] = useState([]);
  const [allCategories, setAllCategories] = useState([]);
  const [selectedTagIds, setSelectedTagIds] = useState(new Set((post?.tags ?? []).map((t) => t.id)));
  const [selectedCategoryIds, setSelectedCategoryIds] = useState(new Set((post?.categories ?? []).map((c) => c.id)));
  const [newTagName, setNewTagName] = useState('');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [taxonomySaving, setTaxonomySaving] = useState(false);

  const debounceTimers = useRef({});

  useEffect(() => {
    if (!post) return;
    setSlug(post.slug ?? '');
    setMetaDescription(post.metaDescription ?? '');
    setCanonicalUrl(post.canonicalUrl ?? '');
    setOgTitle(post.ogTitle ?? '');
    setOgDescription(post.ogDescription ?? '');
    setOgImageUrl(post.ogImageUrl ?? '');
    setCoverImageUrl(post.coverImageUrl ?? '');
    setAuthorName(post.authorName ?? '');
    setExcerpt(post.excerpt ?? '');
    setLinkUrl(post.linkUrl ?? '');
    setPublishedAt(post.publishedAt ? post.publishedAt.slice(0, 10) : '');
    setSelectedTagIds(new Set((post.tags ?? []).map((t) => t.id)));
    setSelectedCategoryIds(new Set((post.categories ?? []).map((c) => c.id)));
  }, [post?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isOpen) return;
    listBlogTags().then((t) => setAllTags(Array.isArray(t) ? t : [])).catch(() => setAllTags([]));
    listBlogCategories().then((c) => setAllCategories(Array.isArray(c) ? c : [])).catch(() => setAllCategories([]));
  }, [isOpen]);

  const persistField = useCallback(async (field, value) => {
    try {
      const updated = await onUpdate({ [field]: value });
      return updated;
    } catch (err) {
      toast.error(err.message ?? 'Save failed');
      return null;
    }
  }, [onUpdate]);

  // Debounced text-field save on change; also saved immediately on blur.
  const scheduleSave = (field, value) => {
    if (debounceTimers.current[field]) clearTimeout(debounceTimers.current[field]);
    debounceTimers.current[field] = setTimeout(() => persistField(field, value), 900);
  };

  useEffect(() => () => {
    Object.values(debounceTimers.current).forEach(clearTimeout);
  }, []);

  const handleSlugBlur = async () => {
    const clean = slugify(slug);
    if (clean === post?.slug) { setSlug(clean); return; }
    setSlugSaving(true);
    try {
      const updated = await onUpdate({ slug: clean });
      if (updated?.slug && updated.slug !== clean) {
        toast(`Slug "${clean}" was taken — using "${updated.slug}" instead`, { icon: '⚠️' });
      }
      setSlug(updated?.slug ?? clean);
    } catch (err) {
      toast.error(err.message ?? 'Could not update slug');
      setSlug(post?.slug ?? '');
    } finally {
      setSlugSaving(false);
    }
  };

  const handleRegenerateSlug = () => {
    setSlug(slugify(title));
  };

  const handleCoverChange = async (url) => {
    setCoverImageUrl(url ?? '');
    await persistField('coverImageUrl', url ?? null);
  };

  const saveTaxonomy = useCallback(async (tagIds, categoryIds) => {
    if (!post?.id) return;
    setTaxonomySaving(true);
    try {
      const updated = await setBlogTaxonomy(post.id, Array.from(tagIds), Array.from(categoryIds));
      onUpdate(null, updated);
    } catch (err) {
      toast.error(err.message ?? 'Could not update tags/categories');
    } finally {
      setTaxonomySaving(false);
    }
  }, [post?.id, onUpdate]);

  const toggleTag = (id) => {
    const next = new Set(selectedTagIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedTagIds(next);
    saveTaxonomy(next, selectedCategoryIds);
  };

  const toggleCategory = (id) => {
    const next = new Set(selectedCategoryIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedCategoryIds(next);
    saveTaxonomy(selectedTagIds, next);
  };

  const handleCreateTag = async (e) => {
    e.preventDefault();
    const name = newTagName.trim();
    if (!name) return;
    try {
      const tag = await createBlogTag(name);
      setAllTags((prev) => [...prev, tag]);
      setNewTagName('');
      const next = new Set(selectedTagIds).add(tag.id);
      setSelectedTagIds(next);
      saveTaxonomy(next, selectedCategoryIds);
    } catch (err) {
      toast.error(err.message ?? 'Could not create tag');
    }
  };

  const handleCreateCategory = async (e) => {
    e.preventDefault();
    const name = newCategoryName.trim();
    if (!name) return;
    try {
      const category = await createBlogCategory(name);
      setAllCategories((prev) => [...prev, category]);
      setNewCategoryName('');
      const next = new Set(selectedCategoryIds).add(category.id);
      setSelectedCategoryIds(next);
      saveTaxonomy(selectedTagIds, next);
    } catch (err) {
      toast.error(err.message ?? 'Could not create category');
    }
  };

  if (!isOpen) return null;

  const metaDescLen = metaDescription.length;
  const metaDescOver = metaDescLen > META_DESC_TARGET;

  return (
    <aside className="cpm-blog-meta-panel" aria-label="Post metadata">
      <div className="cpm-blog-meta-panel-header">
        <h2 className="cpm-blog-meta-panel-title">
          <i className="fas fa-sliders-h" aria-hidden="true" /> Metadata &amp; SEO
        </h2>
        <button type="button" className="cpm-blog-meta-panel-close" onClick={onClose} aria-label="Close metadata panel">
          <i className="fas fa-times" aria-hidden="true" />
        </button>
      </div>

      <div className="cpm-blog-meta-panel-body">
        <BlogCardPanel
          title={title}
          coverImageUrl={coverImageUrl}
          excerpt={excerpt}
          authorName={authorName}
          categoryName={allCategories.find((c) => selectedCategoryIds.has(c.id))?.name}
          publishedAt={post?.publishedAt}
          linkUrl={linkUrl}
          slug={slug}
        />
        {post?.readingTimeMin != null && (
          <div className="cpm-blog-meta-reading-time">
            <i className="fas fa-clock" aria-hidden="true" /> {post.readingTimeMin} min read
          </div>
        )}

        <div className="cpm-blog-meta-field">
          <label className="cpm-form-label">Slug</label>
          <div className="cpm-blog-meta-slug-row">
            <input
              className="cpm-form-input"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              onBlur={handleSlugBlur}
              disabled={slugSaving}
              placeholder="post-slug"
            />
            <button type="button" className="clubpm-btn-secondary" onClick={handleRegenerateSlug} title="Regenerate from title">
              <i className="fas fa-sync-alt" aria-hidden="true" />
            </button>
          </div>
          <span className="cpm-blog-meta-hint">/blog/{slug || 'post-slug'}</span>
        </div>

        <div className="cpm-blog-meta-field">
          <label className="cpm-form-label">Meta description</label>
          <textarea
            className="cpm-form-input cpm-blog-meta-textarea"
            rows={3}
            value={metaDescription}
            onChange={(e) => { setMetaDescription(e.target.value); scheduleSave('metaDescription', e.target.value); }}
            onBlur={(e) => persistField('metaDescription', e.target.value)}
            placeholder="Shown in search results and social shares"
          />
          <span className={`cpm-blog-meta-counter${metaDescOver ? ' is-over' : ''}`}>
            {metaDescLen} / {META_DESC_TARGET}
          </span>
        </div>

        <CoverImageField label="Cover image" value={coverImageUrl} onChange={handleCoverChange} />

        <div className="cpm-blog-meta-field">
          <label className="cpm-form-label">Byline / author name</label>
          <input
            className="cpm-form-input"
            value={authorName}
            onChange={(e) => { setAuthorName(e.target.value); scheduleSave('authorName', e.target.value); }}
            onBlur={(e) => persistField('authorName', e.target.value)}
            placeholder="Defaults to your name; set for guest/historical authors"
          />
        </div>

        <div className="cpm-blog-meta-field">
          <label className="cpm-form-label">Publish date</label>
          <input
            type="date"
            className="cpm-form-input"
            value={publishedAt}
            onChange={(e) => { setPublishedAt(e.target.value); persistField('publishedAt', e.target.value || null); }}
          />
          <span className="cpm-blog-meta-hint">Backdate historical posts; blank = set on publish.</span>
        </div>

        <div className="cpm-blog-meta-field">
          <label className="cpm-form-label">Excerpt</label>
          <textarea
            className="cpm-form-input cpm-blog-meta-textarea"
            rows={3}
            value={excerpt}
            onChange={(e) => { setExcerpt(e.target.value); scheduleSave('excerpt', e.target.value); }}
            onBlur={(e) => persistField('excerpt', e.target.value)}
            placeholder="Card summary; auto-derived from the body if left blank"
          />
        </div>

        <div className="cpm-blog-meta-field">
          <label className="cpm-form-label">Link URL</label>
          <input
            className="cpm-form-input"
            value={linkUrl}
            onChange={(e) => { setLinkUrl(e.target.value); scheduleSave('linkUrl', e.target.value); }}
            onBlur={(e) => persistField('linkUrl', e.target.value)}
            placeholder="e.g. /research/rascal — card links out instead of opening an article"
          />
        </div>

        <div className="cpm-blog-meta-field">
          <label className="cpm-form-label">Tags {taxonomySaving && <span className="cpm-blog-meta-saving">saving…</span>}</label>
          <div className="cpm-blog-meta-chips">
            {allTags.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`cpm-blog-meta-chip${selectedTagIds.has(t.id) ? ' is-selected' : ''}`}
                onClick={() => toggleTag(t.id)}
              >
                {t.name}
              </button>
            ))}
          </div>
          <form className="cpm-blog-meta-add-row" onSubmit={handleCreateTag}>
            <input
              className="cpm-form-input"
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              placeholder="New tag"
            />
            <button type="submit" className="clubpm-btn-secondary" disabled={!newTagName.trim()}>Add</button>
          </form>
        </div>

        <div className="cpm-blog-meta-field">
          <label className="cpm-form-label">Categories</label>
          <div className="cpm-blog-meta-chips">
            {allCategories.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`cpm-blog-meta-chip${selectedCategoryIds.has(c.id) ? ' is-selected' : ''}`}
                onClick={() => toggleCategory(c.id)}
              >
                {c.name}
              </button>
            ))}
          </div>
          <form className="cpm-blog-meta-add-row" onSubmit={handleCreateCategory}>
            <input
              className="cpm-form-input"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="New category"
            />
            <button type="submit" className="clubpm-btn-secondary" disabled={!newCategoryName.trim()}>Add</button>
          </form>
        </div>

        <div className="cpm-blog-meta-divider">Open Graph &amp; SEO</div>

        <div className="cpm-blog-meta-field">
          <label className="cpm-form-label">Canonical URL</label>
          <input
            className="cpm-form-input"
            value={canonicalUrl}
            onChange={(e) => { setCanonicalUrl(e.target.value); scheduleSave('canonicalUrl', e.target.value); }}
            onBlur={(e) => persistField('canonicalUrl', e.target.value)}
            placeholder="/blog/post-slug"
          />
        </div>

        <div className="cpm-blog-meta-field">
          <label className="cpm-form-label">OG title</label>
          <input
            className="cpm-form-input"
            value={ogTitle}
            onChange={(e) => { setOgTitle(e.target.value); scheduleSave('ogTitle', e.target.value); }}
            onBlur={(e) => persistField('ogTitle', e.target.value)}
            placeholder="Defaults to post title"
          />
        </div>

        <div className="cpm-blog-meta-field">
          <label className="cpm-form-label">OG description</label>
          <textarea
            className="cpm-form-input cpm-blog-meta-textarea"
            rows={2}
            value={ogDescription}
            onChange={(e) => { setOgDescription(e.target.value); scheduleSave('ogDescription', e.target.value); }}
            onBlur={(e) => persistField('ogDescription', e.target.value)}
            placeholder="Defaults to meta description"
          />
        </div>

        <CoverImageField label="OG image" value={ogImageUrl} onChange={(url) => { setOgImageUrl(url ?? ''); persistField('ogImageUrl', url ?? null); }} />
      </div>
    </aside>
  );
}
