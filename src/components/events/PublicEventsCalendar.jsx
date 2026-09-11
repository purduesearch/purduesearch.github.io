import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PublicCalendarMenu from './PublicCalendarMenu';
import PublicEventCard from './PublicEventCard';
import PublicEventsMonthGrid from './PublicEventsMonthGrid';
import {
  groupByDay, upcomingEvents, filterByType, purdueDayKey, purdueMonthOf,
  shiftMonth, compareMonth, formatDayKey,
} from '../../lib/publicEvents';
import {
  feedHttpsUrl, feedWebcalUrl, googleSubscribeUrl, outlookSubscribeUrl,
} from '../../lib/calendarLinks';

const API_BASE = process.env.REACT_APP_API_URL || '';
const DAY_MS = 86_400_000;
const PAGE = 6;
const FILTERS = [
  { key: 'ALL', label: 'All' },
  { key: 'MEETING', label: 'Meetings' },
  { key: 'WORKSHOP', label: 'Workshops' },
  { key: 'SOCIAL', label: 'Socials' },
  { key: 'OTHER', label: 'Other' },
];

export default function PublicEventsCalendar() {
  const sectionRef = useRef(null);
  const copiedTimer = useRef(null);

  // One fetch covers the whole navigable window (see plan decision 9).
  const [range] = useState(() => {
    const now = Date.now();
    return { from: new Date(now - 30 * DAY_MS), to: new Date(now + 330 * DAY_MS) };
  });
  const [shouldLoad, setShouldLoad] = useState(false);
  const [status, setStatus] = useState('idle'); // idle | loading | ready | error
  const [events, setEvents] = useState([]);
  const [month, setMonth] = useState(() => purdueMonthOf(new Date()));
  const [selectedKey, setSelectedKey] = useState(null);
  const [filter, setFilter] = useState('ALL');
  const [visible, setVisible] = useState(PAGE);
  const [expandedId, setExpandedId] = useState(null);
  const [copied, setCopied] = useState(false);

  // Don't hit the API for visitors who never scroll this far.
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return undefined;
    if (typeof IntersectionObserver === 'undefined') { setShouldLoad(true); return undefined; }
    const io = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) { setShouldLoad(true); io.disconnect(); }
    }, { rootMargin: '400px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const qs = new URLSearchParams({ from: range.from.toISOString(), to: range.to.toISOString() });
      const res = await fetch(`${API_BASE}/api/public/events?${qs.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setEvents(Array.isArray(data) ? data : []);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, [range]);

  useEffect(() => { if (shouldLoad) load(); }, [shouldLoad, load]);
  useEffect(() => () => clearTimeout(copiedTimer.current), []);
  useEffect(() => { setVisible(PAGE); }, [filter, selectedKey]);

  const filtered = useMemo(() => filterByType(events, filter), [events, filter]);
  const byDay = useMemo(() => groupByDay(filtered), [filtered]);
  const list = useMemo(
    () => (selectedKey ? (byDay.get(selectedKey) ?? []) : upcomingEvents(filtered, new Date())),
    [selectedKey, byDay, filtered],
  );

  const todayKey = purdueDayKey(new Date());
  const minMonth = purdueMonthOf(range.from);
  const maxMonth = purdueMonthOf(range.to);

  async function copyFeed() {
    const url = feedHttpsUrl();
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.prompt('Copy this calendar feed URL:', url);
      return;
    }
    setCopied(true);
    clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), 2000);
  }

  const subscribeItems = [
    { label: 'Google Calendar', icon: 'fab fa-google', href: googleSubscribeUrl(), external: true },
    { label: 'Apple Calendar', icon: 'fab fa-apple', href: feedWebcalUrl() },
    { label: 'Outlook.com', icon: 'fab fa-microsoft', href: outlookSubscribeUrl('live'), external: true },
    { label: 'Microsoft 365 (Purdue)', icon: 'fas fa-building', href: outlookSubscribeUrl('office'), external: true },
    {
      label: copied ? 'Copied!' : 'Copy feed URL',
      icon: copied ? 'fas fa-check' : 'fas fa-link',
      onSelect: copyFeed,
      keepOpen: true,
    },
  ];

  let body;
  if (status === 'idle' || status === 'loading') {
    body = (
      <div className="home-events-list" aria-busy="true" aria-label="Loading events">
        {[0, 1, 2].map(i => <div key={i} className="home-events-skeleton" />)}
      </div>
    );
  } else if (status === 'error') {
    body = (
      <p className="home-events-state">
        We couldn't load events right now.{' '}
        <button type="button" className="home-events-link-btn" onClick={load}>Try again</button>
      </p>
    );
  } else if (list.length === 0) {
    body = (
      <p className="home-events-state">
        {selectedKey
          ? 'No events on this day.'
          : "No public events scheduled yet — subscribe and they'll show up in your calendar as soon as they're announced."}
      </p>
    );
  } else {
    body = (
      <div className="home-events-list">
        {list.slice(0, visible).map(ev => (
          <PublicEventCard
            key={ev.id}
            event={ev}
            expanded={expandedId === ev.id}
            onToggle={() => setExpandedId(id => (id === ev.id ? null : ev.id))}
          />
        ))}
        {list.length > visible && (
          <button type="button" className="home-events-menu-btn home-events-menu-btn--ghost home-events-show-more" onClick={() => setVisible(v => v + PAGE)}>
            Show more events
          </button>
        )}
      </div>
    );
  }

  return (
    <section id="events" className="home-events" ref={sectionRef} aria-labelledby="home-events-title">
      <div className="container">
        <div className="home-events-header" data-aos="fade-up">
          <div className="home-events-heading">
            <h2 id="home-events-title" className="section-title">Upcoming <b>Events</b></h2>
            <p className="section-sub-title">
              General meetings, workshops, and socials — open to all Purdue students. All times are Eastern.
            </p>
          </div>
          <PublicCalendarMenu
            label="Subscribe"
            icon="fas fa-rss"
            items={subscribeItems}
            align="right"
            footnote="Subscribed calendars update automatically every few hours."
          />
        </div>

        <div className="row">
          <div className="col-lg-5 mb-4 mb-lg-0">
            <PublicEventsMonthGrid
              month={month}
              canPrev={compareMonth(month, minMonth) > 0}
              canNext={compareMonth(month, maxMonth) < 0}
              onPrev={() => setMonth(m => shiftMonth(m, -1))}
              onNext={() => setMonth(m => shiftMonth(m, 1))}
              eventsByDay={byDay}
              selectedKey={selectedKey}
              onSelectDay={setSelectedKey}
              todayKey={todayKey}
            />
          </div>
          <div className="col-lg-7">
            <div className="home-events-filters" role="group" aria-label="Filter events by type">
              {FILTERS.map(f => (
                <button
                  key={f.key}
                  type="button"
                  className="home-events-chip"
                  aria-pressed={filter === f.key}
                  onClick={() => setFilter(f.key)}
                >
                  {f.label}
                </button>
              ))}
            </div>
            {selectedKey && (
              <div className="home-events-day-banner">
                <span>Showing <strong>{formatDayKey(selectedKey)}</strong></span>
                <button type="button" className="home-events-link-btn" onClick={() => setSelectedKey(null)}>
                  Show all upcoming
                </button>
              </div>
            )}
            <div aria-live="polite">{body}</div>
          </div>
        </div>
      </div>
    </section>
  );
}
