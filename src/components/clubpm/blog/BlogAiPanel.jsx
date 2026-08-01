import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { blogAiAsk, blogAiEdit, createBlogThread, generateBlogDoc } from '../../../api/clubPmClient';
import { findQuoteRange } from './aiQuoteMatch';

const QUICK_ACTIONS = [
  { label: 'Tighten', instruction: 'Make this tighter and less wordy without losing meaning.' },
  { label: 'Fix grammar', instruction: 'Fix grammar, spelling and punctuation only. Change nothing else.' },
  { label: 'More formal', instruction: 'Raise the register to formal but still readable prose.' },
  { label: 'Plainer', instruction: 'Rewrite in plainer language a first-year student would follow.' },
  { label: 'Active voice', instruction: 'Convert passive constructions to active voice.' },
];

// One proposed edit. `range` is null when the quote could not be located, in
// which case the card is informational only — anchoring a guess would damage
// the post, so we surface the miss instead.
function EditCard({ edit, onSuggest, busy }) {
  const [replace, setReplace] = useState(edit.replace);
  const locatable = !!edit.range;

  return (
    <div className={`cpm-blog-ai-edit-card${locatable ? '' : ' cpm-blog-ai-edit-card--unlocatable'}`}>
      <div className="cpm-blog-thread-diff">
        <del>{edit.find}</del>
        <ins>{replace || '(delete)'}</ins>
      </div>
      {edit.rationale && <p className="cpm-blog-thread-rationale">{edit.rationale}</p>}
      {locatable ? (
        <>
          <textarea
            className="cpm-blog-ai-input"
            style={{ minHeight: 48 }}
            value={replace}
            onChange={(e) => setReplace(e.target.value)}
          />
          <div className="cpm-blog-thread-actions">
            <button
              type="button"
              className="clubpm-btn-primary"
              disabled={busy}
              onClick={() => onSuggest(edit, replace)}
            >
              <i className="fas fa-pen-to-square" aria-hidden="true" /> Suggest
            </button>
          </div>
        </>
      ) : (
        <p className="cpm-blog-thread-rationale">
          <i className="fas fa-triangle-exclamation" aria-hidden="true" />{' '}
          Couldn’t find this text in the post — it may have changed since. Skipped.
        </p>
      )}
    </div>
  );
}

export default function BlogAiPanel({
  editor, docType, docId, title, isOpen, onClose, initialSelection, onThreadsChanged, onGenerated,
}) {
  const [tab, setTab] = useState('ask'); // 'ask' | 'selection' | 'document' | 'generate'
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [instruction, setInstruction] = useState('');
  const [edits, setEdits] = useState([]);
  const [busy, setBusy] = useState(false);
  // Full-article generation (only offered when the host wires onGenerated).
  const [genText, setGenText] = useState('');
  const [genGuidance, setGenGuidance] = useState('');
  const [genMode, setGenMode] = useState('append'); // 'append' | 'replace'

  // Arriving from the bubble's "Ask AI" means the user already has a selection
  // in mind, so open straight onto the selection tab.
  useEffect(() => {
    if (isOpen && initialSelection) setTab('selection');
  }, [isOpen, initialSelection]);

  if (!isOpen) return null;

  const selectedText = editor && !editor.state.selection.empty
    ? editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to, ' ')
    : '';

  const ask = async () => {
    if (!question.trim()) return;
    setBusy(true); setAnswer('');
    try {
      const { answer: a } = await blogAiAsk(docType, docId, question);
      setAnswer(a || 'No answer came back.');
    } catch (err) {
      toast.error(err.message ?? 'AI request failed');
    } finally { setBusy(false); }
  };

  const requestEdits = async (instructionText) => {
    const text = (instructionText ?? instruction).trim();
    if (!text) { toast.error('Say what you want changed'); return; }
    if (tab === 'selection' && !selectedText) { toast.error('Select some text first'); return; }

    setBusy(true); setEdits([]);
    try {
      const { edits: raw } = await blogAiEdit(docType, docId, {
        scope: tab === 'selection' ? 'selection' : 'document',
        instruction: text,
        ...(tab === 'selection' ? { selection: selectedText } : {}),
      });
      if (!raw?.length) { toast.success('Nothing to change'); return; }
      // Locate every quote against the LIVE doc, not the server's snapshot —
      // co-editors may have moved things since the last save.
      setEdits(raw.map((e) => ({ ...e, range: findQuoteRange(editor.state.doc, e.find) })));
    } catch (err) {
      toast.error(err.message ?? 'AI request failed');
    } finally { setBusy(false); }
  };

  // The AI never writes to the document — it only creates suggestions, which is
  // what keeps this safe while other people are editing the same post.
  const suggestOne = async (edit, replaceText) => {
    const range = findQuoteRange(editor.state.doc, edit.find);
    if (!range) { toast.error('That text is no longer in the post'); return; }
    setBusy(true);
    try {
      const thread = await createBlogThread(docType, docId, {
        kind: 'SUGGESTION',
        origin: 'AI',
        anchorText: edit.find,
        replaceWith: replaceText,
        rationale: edit.rationale,
        body: '',
      });
      editor.chain().focus()
        .applySuggestion({ threadId: thread.id, from: range.from, to: range.to, replace: replaceText })
        .run();
      setEdits((prev) => prev.filter((e) => e !== edit));
      onThreadsChanged?.();
    } catch (err) {
      toast.error(err.message ?? 'Could not record that suggestion');
    } finally { setBusy(false); }
  };

  const suggestAll = async () => {
    for (const edit of edits.filter((e) => e.range)) {
      // Sequential on purpose: each applied suggestion shifts the positions of
      // the ones after it, so every quote is re-located against the fresh doc.
      // eslint-disable-next-line no-await-in-loop
      await suggestOne(edit, edit.replace);
    }
  };

  // Turns raw notes/brief into a full section-based article and drops it into
  // the open post. The server only builds the doc — nothing is persisted until
  // the normal autosave runs, so this is undoable like any other edit.
  const generate = async () => {
    if (!genText.trim() || !editor) return;
    if (genMode === 'replace'
      && !window.confirm('Replace everything in this post with the generated article?')) return;

    setBusy(true);
    try {
      const { title: suggestedTitle, doc } = await generateBlogDoc({
        text: genText.trim(),
        ...(genGuidance.trim() ? { guidance: genGuidance.trim() } : {}),
      });
      if (!doc?.content?.length) { toast.error('The AI returned an empty article'); return; }

      if (genMode === 'replace') {
        editor.commands.setContent(doc);
      } else {
        editor.chain().focus()
          .insertContentAt(editor.state.doc.content.size, doc.content)
          .run();
      }
      onGenerated?.({ title: suggestedTitle, mode: genMode });
      setGenText('');
      toast.success('Article generated');
    } catch (err) {
      toast.error(err.message ?? 'Could not generate the article');
    } finally { setBusy(false); }
  };

  const locatable = edits.filter((e) => e.range).length;

  return (
    <aside className="cpm-blog-meta-panel" aria-label="AI assistant">
      <div className="cpm-blog-meta-panel-header">
        <h2 className="cpm-blog-meta-panel-title">
          <i className="fas fa-wand-magic-sparkles" aria-hidden="true" /> AI Assistant
        </h2>
        <button type="button" className="cpm-blog-meta-panel-close" onClick={onClose} aria-label="Close AI panel">
          <i className="fas fa-times" aria-hidden="true" />
        </button>
      </div>

      <div className="cpm-blog-meta-panel-body">
        <div className="cpm-blog-ai-panel">
          <div className="cpm-blog-ai-tabs" role="tablist">
            {[
              { id: 'ask', label: 'Ask' },
              { id: 'selection', label: 'Selection' },
              { id: 'document', label: 'Whole post' },
              ...(onGenerated ? [{ id: 'generate', label: 'Generate' }] : []),
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                className={tab === t.id ? 'is-active' : ''}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'ask' ? (
            <>
              <textarea
                className="cpm-blog-ai-input"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder={`Ask anything about “${title || 'this post'}” — what's missing, is the tone consistent, does the intro work?`}
              />
              <button type="button" className="clubpm-btn-primary" disabled={busy} onClick={ask}>
                {busy ? 'Thinking…' : 'Ask'}
              </button>
              {answer && <div className="cpm-blog-ai-answer">{answer}</div>}
            </>
          ) : tab === 'generate' ? (
            <>
              <p className="cpm-blog-thread-rationale">
                Paste notes, an outline, or a rough draft — the AI writes a full,
                section-based article and drops it into this post.
              </p>
              <textarea
                className="cpm-blog-ai-input"
                style={{ minHeight: 160 }}
                value={genText}
                onChange={(e) => setGenText(e.target.value)}
                placeholder="Paste the raw text, meeting notes, an outline, or a rough draft…"
              />
              <textarea
                className="cpm-blog-ai-input"
                style={{ minHeight: 48 }}
                value={genGuidance}
                onChange={(e) => setGenGuidance(e.target.value)}
                placeholder="Guidance (optional) — e.g. announcement tone, focus on the technical challenges"
              />
              <div className="cpm-blog-ai-quick" role="radiogroup" aria-label="Where to put the generated article">
                {[
                  { id: 'append', label: 'Add to end' },
                  { id: 'replace', label: 'Replace post' },
                ].map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    role="radio"
                    aria-checked={genMode === m.id}
                    className={genMode === m.id ? 'clubpm-btn-primary' : 'clubpm-btn-secondary'}
                    disabled={busy}
                    onClick={() => setGenMode(m.id)}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="clubpm-btn-primary"
                disabled={busy || !genText.trim()}
                onClick={generate}
              >
                {busy
                  ? <><i className="fas fa-spinner fa-spin" aria-hidden="true" style={{ marginRight: 6 }} />Generating…</>
                  : <><i className="fas fa-wand-magic-sparkles" aria-hidden="true" style={{ marginRight: 6 }} />Generate article</>}
              </button>
            </>
          ) : (
            <>
              {tab === 'selection' && (
                <p className="cpm-blog-bubble-form-quote">
                  {selectedText
                    ? `“${selectedText.slice(0, 180)}”`
                    : 'Select text in the post, then choose an action.'}
                </p>
              )}
              <div className="cpm-blog-ai-quick">
                {QUICK_ACTIONS.map((a) => (
                  <button
                    key={a.label}
                    type="button"
                    className="clubpm-btn-secondary"
                    disabled={busy}
                    onClick={() => { setInstruction(a.instruction); requestEdits(a.instruction); }}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
              <textarea
                className="cpm-blog-ai-input"
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder={tab === 'selection'
                  ? 'Or describe the change you want to this selection…'
                  : 'Describe the change you want across the whole post…'}
              />
              <button type="button" className="clubpm-btn-primary" disabled={busy} onClick={() => requestEdits()}>
                {busy ? 'Working…' : 'Propose edits'}
              </button>

              {edits.length > 0 && (
                <>
                  <p className="cpm-blog-thread-rationale">
                    {locatable} of {edits.length} edits can be applied.
                    Each becomes a suggestion you can accept or reject.
                  </p>
                  {locatable > 1 && (
                    <button type="button" className="clubpm-btn-secondary" disabled={busy} onClick={suggestAll}>
                      Suggest all {locatable}
                    </button>
                  )}
                  {edits.map((e, i) => (
                    <EditCard key={`${e.find}-${i}`} edit={e} busy={busy} onSuggest={suggestOne} />
                  ))}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </aside>
  );
}
