import React, { useState, useEffect, useCallback, useRef } from 'react';
import { get, post } from '../../api/clubPmClient';
import toast from 'react-hot-toast';

// ── Constants ─────────────────────────────────────────────────

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const STATUS_COLORS = {
  DRAFT:      'var(--pm-text-secondary)',
  SUBMITTED:  'var(--pm-accent-amber)',
  IN_REVIEW:  '#a29bfe',
  APPROVED:   'var(--pm-accent-teal)',
  PUBLISHED:  '#00b894',
};

const TYPE_COLORS_CAL = {
  SOCIAL_POST:  '#6c5ce7',
  NEWSLETTER:   '#00b894',
  PHOTO:        '#fdcb6e',
  VIDEO:        '#e17055',
  ANNOUNCEMENT: '#00cec9',
  EVENT_PROMO:  '#fd79a8',
};

const PLATFORM_COLORS_CAL = {
  instagram: '#e1306c',
  linkedin:  '#0077b5',
  twitter:   '#1da1f2',
  website:   '#00cec9',
};

const EVENT_TYPE_COLORS = {
  WORKSHOP: '#a29bfe',
  SOCIAL:   '#fd79a8',
  DEADLINE: '#e17055',
  OTHER:    '#74b9ff',
};

// ── Helpers ───────────────────────────────────────────────────

function startOfWeek(d) {
  const r = new Date(d);
  r.setDate(d.getDate() - d.getDay());
  r.setHours(0, 0, 0, 0);
  return r;
}

function endOfWeek(d) {
  const r = startOfWeek(d);
  r.setDate(r.getDate() + 6);
  r.setHours(23, 59, 59, 999);
  return r;
}

function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

function endOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth() === b.getMonth() &&
         a.getDate() === b.getDate();
}

function fmtDate(str) {
  if (!str) return '';
  return new Date(str).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fmtTime(str) {
  if (!str) return '';
  return new Date(str).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function colorForItem(item, colorBy, campaigns) {
  if (colorBy === 'campaign') {
    const camp = campaigns.find(c => c.id === item.campaignId);
    return camp?.color ?? 'var(--pm-accent-teal)';
  }
  if (colorBy === 'platform') {
    const p = (item.platform ?? [])[0];
    return p ? (PLATFORM_COLORS_CAL[p] ?? 'var(--pm-accent-teal)') : 'var(--pm-accent-teal)';
  }
  return STATUS_COLORS[item.status] ?? 'var(--pm-accent-teal)';
}

// ── SubmissionPill ────────────────────────────────────────────

function SubmissionPill({ item, color }) {
  const [tip, setTip] = useState(false);
  return (
    <div
      className="pm-cal-pill"
      style={{ background: color + '22', borderColor: color, color }}
      onMouseEnter={() => setTip(true)}
      onMouseLeave={() => setTip(false)}
    >
      <span className="pm-cal-pill-title">{item.title}</span>
      {tip && (
        <div className="pm-cal-pill-tooltip">
          <strong>{item.title}</strong>
          <div>{item.status} {item.scheduledAt ? `· ${fmtTime(item.scheduledAt)}` : ''}</div>
          {item.type && <div>{item.type.replace('_', ' ')}</div>}
        </div>
      )}
    </div>
  );
}

// ── EventBand ─────────────────────────────────────────────────

function EventBand({ event }) {
  const color = EVENT_TYPE_COLORS[event.type] ?? '#74b9ff';
  const [tip, setTip] = useState(false);
  return (
    <div
      className="pm-cal-event-band"
      style={{ background: color + '18', borderColor: color + '60' }}
      onMouseEnter={() => setTip(true)}
      onMouseLeave={() => setTip(false)}
    >
      <i className="fas fa-calendar-day" aria-hidden="true" style={{ fontSize: 9, marginRight: 3, color }} />
      <span style={{ color, fontSize: 10 }}>{event.title}</span>
      {tip && (
        <div className="pm-cal-pill-tooltip">
          <strong>{event.title}</strong>
          {event.startTime && <div>{fmtDate(event.startTime)} {fmtTime(event.startTime)}</div>}
          {event.type && <div>{event.type}</div>}
        </div>
      )}
    </div>
  );
}

// ── DayCell ───────────────────────────────────────────────────

function DayCell({ date, items, events, colorBy, campaigns, isToday, isCurrentMonth }) {
  const dayItems = items.filter(s => s.scheduledAt && isSameDay(new Date(s.scheduledAt), date));
  const dayEvents = events.filter(e => e.startTime && isSameDay(new Date(e.startTime), date));
  const MAX_SHOWN = 2;

  return (
    <div className={`pm-cal-day${isToday ? ' pm-cal-day--today' : ''}${!isCurrentMonth ? ' pm-cal-day--faded' : ''}`}>
      <div className="pm-cal-day-num">{date.getDate()}</div>
      {dayEvents.map(ev => (
        <EventBand key={ev.id} event={ev} />
      ))}
      {dayItems.slice(0, MAX_SHOWN).map(item => (
        <SubmissionPill
          key={item.id}
          item={item}
          color={colorForItem(item, colorBy, campaigns)}
        />
      ))}
      {dayItems.length > MAX_SHOWN && (
        <div className="pm-cal-pill pm-cal-pill--more">+{dayItems.length - MAX_SHOWN} more</div>
      )}
    </div>
  );
}

// ── MonthGrid ─────────────────────────────────────────────────

function MonthGrid({ anchor, items, events, colorBy, campaigns }) {
  const today = new Date();
  const monthStart = startOfMonth(anchor);
  const monthEnd   = endOfMonth(anchor);

  // Build grid: start from the Sunday before monthStart
  const gridStart = startOfWeek(monthStart);
  const gridEnd   = endOfWeek(monthEnd);
  const days = [];
  const cur = new Date(gridStart);
  while (cur <= gridEnd) {
    days.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }

  return (
    <div className="pm-cal-month-grid">
      {DAYS.map(d => (
        <div key={d} className="pm-cal-day-header">{d}</div>
      ))}
      {days.map((day, i) => (
        <DayCell
          key={i}
          date={day}
          items={items}
          events={events}
          colorBy={colorBy}
          campaigns={campaigns}
          isToday={isSameDay(day, today)}
          isCurrentMonth={day.getMonth() === anchor.getMonth()}
        />
      ))}
    </div>
  );
}

// ── WeekGrid ──────────────────────────────────────────────────

function WeekGrid({ anchor, items, events, colorBy, campaigns }) {
  const today   = new Date();
  const wStart  = startOfWeek(anchor);
  const days    = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(wStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  return (
    <div className="pm-cal-week-grid">
      {days.map((day, i) => {
        const dayItems  = items.filter(s => s.scheduledAt && isSameDay(new Date(s.scheduledAt), day));
        const dayEvents = events.filter(e => e.startTime && isSameDay(new Date(e.startTime), day));
        const isToday   = isSameDay(day, today);
        return (
          <div key={i} className={`pm-cal-week-col${isToday ? ' pm-cal-week-col--today' : ''}`}>
            <div className="pm-cal-week-col-header">
              <span className="pm-cal-week-day-name">{DAYS[day.getDay()]}</span>
              <span className={`pm-cal-week-day-num${isToday ? ' pm-cal-week-day-num--today' : ''}`}>{day.getDate()}</span>
            </div>
            <div className="pm-cal-week-col-body">
              {dayEvents.map(ev => <EventBand key={ev.id} event={ev} />)}
              {dayItems.map(item => (
                <SubmissionPill
                  key={item.id}
                  item={item}
                  color={colorForItem(item, colorBy, campaigns)}
                />
              ))}
              {dayItems.length === 0 && dayEvents.length === 0 && (
                <div className="pm-cal-week-empty">—</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── AiAutoFillPanel ───────────────────────────────────────────

function AiAutoFillPanel({ anchor, view, onDraftsCreated, onClose }) {
  const [loading, setLoading]   = useState(false);
  const [drafts,  setDrafts]    = useState(null);
  const [accepted, setAccepted] = useState(new Set());

  const generate = async () => {
    setLoading(true);
    setDrafts(null);
    setAccepted(new Set());
    try {
      const from = view === 'week'
        ? startOfWeek(anchor).toISOString()
        : startOfMonth(anchor).toISOString();
      const to = view === 'week'
        ? endOfWeek(anchor).toISOString()
        : endOfMonth(anchor).toISOString();
      const result = await post('/api/outreach/ai/calendar-autofill', { from, to });
      setDrafts(Array.isArray(result.drafts) ? result.drafts : []);
    } catch (err) {
      toast.error(err.message ?? 'AI auto-fill failed.');
    } finally {
      setLoading(false);
    }
  };

  const toggle = (i) => setAccepted(prev => {
    const next = new Set(prev);
    if (next.has(i)) next.delete(i); else next.add(i);
    return next;
  });

  const accept = async () => {
    const chosen = drafts.filter((_, i) => accepted.has(i));
    try {
      const created = await Promise.all(chosen.map(d =>
        post('/api/outreach/submissions', { ...d, status: 'DRAFT' })
      ));
      toast.success(`Created ${created.length} draft submission${created.length !== 1 ? 's' : ''}.`);
      onDraftsCreated?.();
      onClose();
    } catch (err) {
      toast.error(err.message ?? 'Failed to create drafts.');
    }
  };

  return (
    <div className="pm-cal-autofill-panel">
      <div className="pm-cal-autofill-header">
        <span className="pm-cal-autofill-title">
          <i className="fas fa-robot" aria-hidden="true" /> AI Auto-Fill
        </span>
        <button className="pm-modal-close-btn" onClick={onClose} aria-label="Close">
          <i className="fas fa-times" aria-hidden="true" />
        </button>
      </div>
      <p className="pm-cal-autofill-desc">
        Gemini will scan upcoming events and milestones and suggest draft posts for the
        visible {view === 'week' ? 'week' : 'month'}.
      </p>

      {!drafts && !loading && (
        <button className="cpm-btn cpm-btn--primary" style={{ width: '100%' }} onClick={generate}>
          <i className="fas fa-magic" aria-hidden="true" /> Generate Suggestions
        </button>
      )}

      {loading && (
        <div className="pm-outreach-loading" style={{ minHeight: 80 }}>
          <div className="pm-outreach-spinner" />
          <span style={{ marginLeft: 10, fontSize: 13, color: 'var(--clubpm-text-secondary)' }}>
            Gemini is thinking…
          </span>
        </div>
      )}

      {drafts && drafts.length === 0 && (
        <div className="pm-outreach-empty" style={{ padding: '20px 0' }}>
          <i className="fas fa-check-circle" aria-hidden="true" />
          <p>No content gaps found for this period — great job staying ahead!</p>
        </div>
      )}

      {drafts && drafts.length > 0 && (
        <>
          <ul className="pm-cal-autofill-list">
            {drafts.map((d, i) => (
              <li
                key={i}
                className={`pm-cal-autofill-item${accepted.has(i) ? ' pm-cal-autofill-item--selected' : ''}`}
                onClick={() => toggle(i)}
              >
                <input
                  type="checkbox"
                  className="pm-card-checkbox"
                  checked={accepted.has(i)}
                  onChange={() => toggle(i)}
                  onClick={e => e.stopPropagation()}
                />
                <div className="pm-cal-autofill-item-body">
                  <div className="pm-cal-autofill-item-title">{d.title}</div>
                  {d.content && (
                    <div className="pm-cal-autofill-item-content">{d.content.slice(0, 120)}{d.content.length > 120 ? '…' : ''}</div>
                  )}
                  <div className="pm-cal-autofill-item-meta">
                    {d.type && <span>{d.type.replace('_', ' ')}</span>}
                    {d.scheduledAt && <span>{fmtDate(d.scheduledAt)}</span>}
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <div className="pm-cal-autofill-footer">
            <button className="cpm-btn cpm-btn--secondary" onClick={generate} disabled={loading}>
              <i className="fas fa-sync-alt" aria-hidden="true" /> Regenerate
            </button>
            <button
              className="cpm-btn cpm-btn--primary"
              onClick={accept}
              disabled={accepted.size === 0}
            >
              <i className="fas fa-plus" aria-hidden="true" /> Accept {accepted.size > 0 ? `(${accepted.size})` : ''}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── CalendarTab (exported) ────────────────────────────────────

export default function CalendarTab({ campaigns = [] }) {
  const [view,      setView]      = useState('month'); // 'month' | 'week'
  const [anchor,    setAnchor]    = useState(() => new Date());
  const [items,     setItems]     = useState([]);
  const [events,    setEvents]    = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [colorBy,   setColorBy]   = useState('status'); // 'status' | 'platform' | 'campaign'
  const [showAi,    setShowAi]    = useState(false);
  const reloadRef = useRef(0);

  const rangeFrom = view === 'week' ? startOfWeek(anchor) : startOfMonth(anchor);
  const rangeTo   = view === 'week' ? endOfWeek(anchor)   : endOfMonth(anchor);

  const load = useCallback((from, to) => {
    const token = ++reloadRef.current;
    setLoading(true);
    Promise.all([
      get(`/api/outreach/calendar?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`),
      get(`/api/events?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`).catch(() => []),
    ]).then(([subs, evts]) => {
      if (reloadRef.current !== token) return;
      setItems(Array.isArray(subs) ? subs : []);
      setEvents((Array.isArray(evts) ? evts : []).filter(e => e.type !== 'MEETING'));
    }).catch(() => {
      setItems([]); setEvents([]);
    }).finally(() => {
      if (reloadRef.current === token) setLoading(false);
    });
  }, []);

  useEffect(() => {
    load(rangeFrom, rangeTo);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, anchor.getFullYear(), anchor.getMonth(), view === 'week' ? anchor.getDate() - anchor.getDay() : 0]);

  const prev = () => setAnchor(prev => {
    const d = new Date(prev);
    if (view === 'week') d.setDate(d.getDate() - 7);
    else d.setMonth(d.getMonth() - 1);
    return d;
  });

  const next = () => setAnchor(prev => {
    const d = new Date(prev);
    if (view === 'week') d.setDate(d.getDate() + 7);
    else d.setMonth(d.getMonth() + 1);
    return d;
  });

  const rangeLabel = view === 'week'
    ? `${fmtDate(rangeFrom.toISOString())} – ${fmtDate(rangeTo.toISOString())}`
    : anchor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <div className="pm-cal-v2">
      {/* Toolbar */}
      <div className="pm-cal-toolbar">
        <div className="pm-cal-toolbar-left">
          <button className="cpm-nav-btn" onClick={prev}>
            <i className="fas fa-angle-left" aria-hidden="true" />
          </button>
          <span className="pm-cal-range-label">{rangeLabel}</span>
          <button className="cpm-nav-btn" onClick={next}>
            <i className="fas fa-angle-right" aria-hidden="true" />
          </button>
          <button
            className="cpm-nav-btn"
            onClick={() => setAnchor(new Date())}
            title="Jump to today"
          >
            Today
          </button>
        </div>

        <div className="pm-cal-toolbar-right">
          {/* View toggle */}
          <div className="pm-cal-view-toggle" role="group">
            {['month', 'week'].map(v => (
              <button
                key={v}
                className={`pm-cal-view-btn${view === v ? ' pm-cal-view-btn--active' : ''}`}
                onClick={() => setView(v)}
                aria-pressed={view === v}
              >
                {v === 'month' ? 'Month' : 'Week'}
              </button>
            ))}
          </div>

          {/* Color by */}
          <select
            className="pm-cal-colorby-select"
            value={colorBy}
            onChange={e => setColorBy(e.target.value)}
            aria-label="Color by"
          >
            <option value="status">Color: Status</option>
            <option value="platform">Color: Platform</option>
            {campaigns.length > 0 && <option value="campaign">Color: Campaign</option>}
          </select>

          {/* AI auto-fill */}
          <button
            className={`cpm-btn cpm-btn--secondary pm-cal-ai-btn${showAi ? ' pm-cal-ai-btn--active' : ''}`}
            onClick={() => setShowAi(v => !v)}
            title="AI Auto-Fill suggestions"
          >
            <i className="fas fa-magic" aria-hidden="true" /> Auto-Fill
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="pm-cal-legend">
        {colorBy === 'status' && Object.entries(STATUS_COLORS).map(([s, c]) => (
          <span key={s} className="pm-cal-legend-item">
            <span className="pm-cal-legend-dot" style={{ background: c }} />
            {s.replace('_', ' ')}
          </span>
        ))}
        {colorBy === 'platform' && Object.entries(PLATFORM_COLORS_CAL).map(([p, c]) => (
          <span key={p} className="pm-cal-legend-item">
            <span className="pm-cal-legend-dot" style={{ background: c }} />
            {p}
          </span>
        ))}
        {colorBy === 'campaign' && campaigns.map(c => (
          <span key={c.id} className="pm-cal-legend-item">
            <span className="pm-cal-legend-dot" style={{ background: c.color ?? 'var(--pm-accent-teal)' }} />
            {c.name}
          </span>
        ))}
        <span className="pm-cal-legend-item" style={{ marginLeft: 'auto' }}>
          <span className="pm-cal-legend-dot" style={{ background: '#74b9ff', opacity: 0.5 }} />
          Club Events
        </span>
      </div>

      {/* AI auto-fill panel */}
      {showAi && (
        <AiAutoFillPanel
          anchor={anchor}
          view={view}
          onDraftsCreated={() => load(rangeFrom, rangeTo)}
          onClose={() => setShowAi(false)}
        />
      )}

      {/* Grid */}
      {loading ? (
        <div className="pm-outreach-loading" style={{ minHeight: 300 }}>
          <div className="pm-outreach-spinner" />
        </div>
      ) : view === 'month' ? (
        <MonthGrid
          anchor={anchor}
          items={items}
          events={events}
          colorBy={colorBy}
          campaigns={campaigns}
        />
      ) : (
        <WeekGrid
          anchor={anchor}
          items={items}
          events={events}
          colorBy={colorBy}
          campaigns={campaigns}
        />
      )}
    </div>
  );
}
