import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import CalendarView from '../../components/clubpm/CalendarView';
import CalendarFilters from '../../components/clubpm/CalendarFilters';
import EventFormModal from '../../components/clubpm/EventFormModal';
import MeetingPollModal from '../../components/clubpm/MeetingPollModal';
import MeetingPollBoard from '../../components/clubpm/MeetingPollBoard';
import AvatarPortrait from '../../components/clubpm/avatar/AvatarPortrait';
import {
  get, post, patch,
  listMeetingPolls, createMeetingPoll, updateMeetingPoll, deleteMeetingPoll,
  getMeetingPoll, submitAvailability, finalizeMeetingPoll, remindMeetingPoll,
  getAvailabilitySuggestion,
  downloadMeetingPollIcs, googleCalendarUrl,
} from '../../api/clubPmClient';
import { useClubPmAuth } from '../../clubpm/ClubPmAuth';
import { revealStagger } from '../../clubpm/anim/motion';

// ── Helpers ───────────────────────────────────────────────────────

const MONTHS_FULL = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];
const WEEKDAY_ABBR = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

const EVENT_TYPE_COLOR = {
  MEETING:  'var(--clubpm-accent-cyan,  #00cec9)',
  DEADLINE: 'var(--clubpm-accent-red,   #e17055)',
  WORKSHOP: 'var(--clubpm-accent-yellow,#fdcb6e)',
  SOCIAL:   '#a29bfe',
  OTHER:    'var(--clubpm-text-muted,   #636e72)',
};

const EVENT_TYPE_ICON = {
  MEETING:  'fas fa-users',
  DEADLINE: 'fas fa-flag',
  WORKSHOP: 'fas fa-chalkboard-teacher',
  SOCIAL:   'fas fa-star',
  OTHER:    'fas fa-calendar-day',
};

function formatDatetime(isoStr) {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  const date = `${WEEKDAY_ABBR[d.getDay()]}, ${MONTHS_FULL[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${date} at ${time}`;
}

function getMonthRange(date) {
  const year  = date.getFullYear();
  const month = date.getMonth();
  const from  = new Date(year, month, 1).toISOString();
  const to    = new Date(year, month + 1, 0, 23, 59, 59).toISOString();
  return { from, to };
}

// ── Event Detail Modal ────────────────────────────────────────────

function EventDetailModal({ event, onClose, onEdit, isAdmin, projects }) {
  if (!event) return null;

  const borderColor = EVENT_TYPE_COLOR[event.type] ?? EVENT_TYPE_COLOR.OTHER;
  const iconClass   = EVENT_TYPE_ICON[event.type]  ?? EVENT_TYPE_ICON.OTHER;
  const linkedProject = projects.find(p => p.id === event.projectId);

  const modal = (
    <div
      className="cpm-modal-overlay"
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: 'var(--clubpm-surface-200)',
          border: '1px solid var(--clubpm-border)',
          borderRadius: 12,
          width: '100%',
          maxWidth: 520,
          maxHeight: '88vh',
          overflowY: 'auto',
          padding: '24px 28px',
          position: 'relative',
          borderTop: `3px solid ${borderColor}`,
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <span style={{
              width: 36, height: 36, borderRadius: 8, flexShrink: 0,
              background: borderColor, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <i className={iconClass} style={{ color: '#fff', fontSize: 15 }} />
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--clubpm-text-primary)', wordBreak: 'break-word' }}>
                {event.title}
              </div>
              <div style={{ fontSize: 11, color: borderColor, fontWeight: 500, marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {event.type}
              </div>
            </div>
          </div>
          <button
            type="button"
            className="cpm-icon-btn"
            onClick={onClose}
            style={{ fontSize: 16, color: 'var(--clubpm-text-muted)', flexShrink: 0 }}
            aria-label="Close"
          >
            <i className="fas fa-times" />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Date/time */}
          <DetailRow icon="fas fa-clock" label="Starts">
            {formatDatetime(event.startTime)}
          </DetailRow>
          {event.endTime && (
            <DetailRow icon="fas fa-clock" label="Ends">
              {formatDatetime(event.endTime)}
            </DetailRow>
          )}

          {/* Location */}
          {(event.location || event.isVirtual) && (
            <DetailRow icon={event.isVirtual ? 'fas fa-video' : 'fas fa-map-marker-alt'} label="Location">
              {event.isVirtual ? 'Virtual / Online' : event.location}
            </DetailRow>
          )}

          {/* Organizer */}
          {event.organizer && (
            <DetailRow icon="fas fa-user" label="Organizer">
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <AvatarPortrait member={event.organizer} size={18} />
                {event.organizer.displayName}
              </span>
            </DetailRow>
          )}

          {/* Linked project */}
          {linkedProject && (
            <DetailRow icon="fas fa-project-diagram" label="Project">
              {linkedProject.name}
            </DetailRow>
          )}

          {/* Recurring */}
          {event.isRecurring && (
            <DetailRow icon="fas fa-redo" label="Repeats">
              {event.recurrencePattern
                ? event.recurrencePattern.charAt(0).toUpperCase() + event.recurrencePattern.slice(1)
                : 'Yes'}
              {event.recurrenceEndDate && ` · until ${formatDatetime(event.recurrenceEndDate).split(' at ')[0]}`}
            </DetailRow>
          )}

          {/* Attendees */}
          {event.attendees?.length > 0 && (
            <DetailRow icon="fas fa-users" label={`Attendees (${event.attendees.length})`}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 2 }}>
                {event.attendees.map(a => (
                  <span key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'var(--clubpm-surface-100)', borderRadius: 20, padding: '2px 8px 2px 3px', fontSize: 12 }}>
                    <AvatarPortrait member={a} size={16} />
                    <span style={{ color: 'var(--clubpm-text-secondary)' }}>{a.displayName}</span>
                  </span>
                ))}
              </div>
            </DetailRow>
          )}

          {/* Notes */}
          {event.notes && (
            <DetailRow icon="fas fa-sticky-note" label="Notes">
              <span style={{ whiteSpace: 'pre-wrap', color: 'var(--clubpm-text-secondary)' }}>{event.notes}</span>
            </DetailRow>
          )}

        </div>

        <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          {isAdmin && (
            <button
              type="button"
              className="cpm-btn cpm-btn-primary"
              onClick={() => { onClose(); onEdit(event); }}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <i className="fas fa-pencil-alt" />
              Edit
            </button>
          )}
          <button type="button" className="cpm-btn cpm-btn-ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

function DetailRow({ icon, label, children }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13 }}>
      <i className={icon} style={{ color: 'var(--clubpm-text-muted)', fontSize: 13, marginTop: 1, width: 14, flexShrink: 0 }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span style={{ fontSize: 11, color: 'var(--clubpm-text-muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
        <div style={{ color: 'var(--clubpm-text-primary)' }}>{children}</div>
      </div>
    </div>
  );
}

// ── CalendarPage ──────────────────────────────────────────────────

export default function CalendarPage() {
  const { member } = useClubPmAuth();
  const isAdmin = member?.role === 'ADMIN' || member?.isAdmin;

  const [cursor, setCursor] = useState(new Date());
  const [events, setEvents]   = useState([]);
  const [tasks, setTasks]     = useState([]);
  const [projects, setProjects] = useState([]);
  const [members, setMembers]   = useState([]);

  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError]     = useState(null);

  const [selectedEvent, setSelectedEvent]     = useState(null);
  const [showEventForm, setShowEventForm]     = useState(false);
  const [editingEvent, setEditingEvent]       = useState(null);

  // Meeting scheduler (when2meet polls)
  const [polls, setPolls]           = useState([]);
  const [showPollForm, setShowPollForm] = useState(false);
  const [editingPoll, setEditingPoll]   = useState(null);
  const [activePoll, setActivePoll]     = useState(null); // full serialized poll for the board
  const [pollSuggestion, setPollSuggestion] = useState(null); // availability learned from past polls

  // Client-side filters. Selecting nothing means "show everything" for that
  // dimension. `showTaskDeadlines` defaults on so the global view still covers
  // what the project-scoped Calendar tab used to.
  const [filters, setFilters] = useState({
    projectIds: new Set(),
    memberIds: new Set(),
    types: new Set(),
    showTaskDeadlines: true,
  });

  const filteredEvents = useMemo(() => {
    return events.filter(ev => {
      if (filters.types.size > 0 && !filters.types.has(ev.type)) return false;
      if (filters.projectIds.size > 0 && !filters.projectIds.has(ev.projectId)) return false;
      if (filters.memberIds.size > 0) {
        const attendeeIds = new Set((ev.attendees ?? []).map(a => a.id));
        const matches = [...filters.memberIds].some(id => id === ev.organizerId || attendeeIds.has(id));
        if (!matches) return false;
      }
      return true;
    });
  }, [events, filters]);

  const filteredTasks = useMemo(() => {
    if (!filters.showTaskDeadlines) return [];
    return tasks.filter(t => {
      if (filters.projectIds.size > 0 && !filters.projectIds.has(t.projectId)) return false;
      // memberIds filter: my-tasks view already filters server-side to the
      // current member, so member filtering is only useful when expanded;
      // for now we don't gate tasks by member.
      return true;
    });
  }, [tasks, filters]);

  const calendarWrapRef = useRef(null);
  // Reveal sequence: the wrapper stays `visibility: hidden` (layout space
  // reserved, but nothing painted) until the first fetch completes. Then we
  // flip it visible AND run the cell stagger on the same frame, so the user
  // sees a clean mount-in rather than the "already on screen, now re-fade"
  // flicker that happens if we animate cells that are already visible.
  const [revealed, setRevealed] = useState(false);
  const sawLoadingRef = useRef(false);
  useEffect(() => {
    if (eventsLoading) {
      sawLoadingRef.current = true;
      return;
    }
    if (!sawLoadingRef.current) return;
    sawLoadingRef.current = false;
    setRevealed(true);
    // Wait one frame so the wrapper is in the layout tree before anime starts.
    requestAnimationFrame(() => {
      if (!calendarWrapRef.current) return;
      const cells = calendarWrapRef.current.querySelectorAll('.cpm-cal-month-cell, .cpm-cal-week-col-header');
      if (cells.length) revealStagger(cells, { delay: 18, duration: 360, fromY: 6 });
    });
  }, [eventsLoading]);

  // Fetch events for visible month whenever cursor month changes
  const fetchEvents = useCallback(async (date) => {
    const { from, to } = getMonthRange(date);
    setEventsLoading(true);
    setEventsError(null);
    try {
      const data = await get(`/api/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
      setEvents(Array.isArray(data) ? data : (data.events ?? []));
    } catch (err) {
      setEventsError(err.message ?? 'Failed to load events');
    } finally {
      setEventsLoading(false);
    }
  }, []);

  // Fetch tasks, projects, members once on mount
  useEffect(() => {
    get('/api/members/me')
      .then(m => setTasks(m.tasks ?? []))
      .catch(() => {});
    get('/api/projects')
      .then(data => setProjects(Array.isArray(data) ? data : (data.projects ?? [])))
      .catch(() => {});
    get('/api/members')
      .then(data => setMembers(Array.isArray(data) ? data : (data.members ?? [])))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchEvents(cursor);
  }, [cursor, fetchEvents]);

  // ── Meeting polls ────────────────────────────────────────────
  const refreshPolls = useCallback(async () => {
    try {
      const data = await listMeetingPolls();
      setPolls(Array.isArray(data) ? data : []);
    } catch { /* non-fatal */ }
  }, []);

  useEffect(() => { refreshPolls(); }, [refreshPolls]);

  const openPollBoard = useCallback(async (id) => {
    try {
      const full = await getMeetingPoll(id);
      setActivePoll(full);
      setPollSuggestion(null);
      // Suggestion is advisory — a failure just means no ghost overlay.
      getAvailabilitySuggestion(id)
        .then(s => setPollSuggestion(s?.slots?.length ? s : null))
        .catch(() => {});
    } catch { /* ignore */ }
  }, []);

  async function handleSavePoll(payload) {
    let saved;
    if (editingPoll) saved = await updateMeetingPoll(editingPoll.id, payload);
    else             saved = await createMeetingPoll(payload);
    setEditingPoll(null);
    await refreshPolls();
    if (saved?.id) await openPollBoard(saved.id);
  }

  async function handleRespond(slots) {
    if (!activePoll) return;
    const updated = await submitAvailability(activePoll.id, slots);
    setActivePoll(updated);
    refreshPolls();
  }

  async function handleFinalizePoll(startIso, endIso) {
    if (!activePoll) return;
    const updated = await finalizeMeetingPoll(activePoll.id, startIso, endIso);
    setActivePoll(updated);
    refreshPolls();
    fetchEvents(cursor); // the new Event shows on the calendar
  }

  async function handleRemindPoll() {
    if (!activePoll) return;
    await remindMeetingPoll(activePoll.id);
  }

  async function handleDeletePoll() {
    if (!activePoll) return;
    if (!window.confirm('Delete this meeting poll? This cannot be undone.')) return;
    await deleteMeetingPoll(activePoll.id);
    setActivePoll(null);
    refreshPolls();
  }

  async function handleSaveEvent(formData) {
    if (editingEvent) {
      await patch(`/api/events/${editingEvent.id}`, formData);
    } else {
      await post('/api/events', formData);
    }
    await fetchEvents(cursor);
  }

  async function handleEventMove(eventId, targetDayKey) {
    const event = events.find(e => e.id === eventId);
    if (!event) return;

    const srcDate = new Date(event.startTime);
    const srcKey  = `${srcDate.getFullYear()}-${String(srcDate.getMonth()+1).padStart(2,'0')}-${String(srcDate.getDate()).padStart(2,'0')}`;
    if (srcKey === targetDayKey) return;

    const delta = Math.round(
      (new Date(`${targetDayKey}T12:00:00`) - new Date(`${srcKey}T12:00:00`)) / 86400000
    );
    if (delta === 0) return;

    function shiftISO(iso) {
      const d = new Date(iso);
      d.setDate(d.getDate() + delta);
      return d.toISOString();
    }

    const newStart = shiftISO(event.startTime);
    const newEnd   = event.endTime ? shiftISO(event.endTime) : undefined;

    // Optimistic update
    setEvents(prev => prev.map(e =>
      e.id === eventId
        ? { ...e, startTime: newStart, ...(newEnd ? { endTime: newEnd } : {}) }
        : e
    ));

    try {
      await patch(`/api/events/${eventId}`, {
        startTime: newStart,
        ...(newEnd !== undefined ? { endTime: newEnd } : {}),
      });
    } catch {
      fetchEvents(cursor); // revert on failure
    }
  }

  // CalendarView raises cursor changes via internal state; we need to intercept
  // month changes to re-fetch events. We do this by watching a synthetic cursor
  // exposed through a key prop — simpler: lift cursor into CalendarPage and
  // pass it down. CalendarView currently manages cursor internally, so we keep
  // a parallel month cursor here updated when the user can trigger navigation
  // via our wrapper. A lightweight approach: re-fetch whenever cursor month
  // changes. Since CalendarView owns its own cursor, we sync via a callback
  // passed as onMonthChange. Because CalendarView does not yet support
  // onMonthChange, we instead re-fetch at a coarser granularity: we watch the
  // cursor state here (which is only used for range queries) and let CalendarView
  // be self-contained. The page-level cursor is solely for the API fetch range.

  return (
    <div className="clubpm-animate-fade-in" style={{ padding: '0 0 40px' }}>

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--clubpm-text-primary)' }}>
            <i className="fas fa-calendar-alt" style={{ marginRight: 10, color: 'var(--clubpm-accent-cyan)' }} />
            Club Calendar
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--clubpm-text-muted)' }}>
            Tasks, deadlines, and club events in one view
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="cpm-btn cpm-btn-ghost"
            onClick={() => { setEditingPoll(null); setShowPollForm(true); }}
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <i className="fas fa-calendar-check" />
            New Poll
          </button>
          {isAdmin && (
            <button
              type="button"
              className="cpm-btn cpm-btn-primary"
              onClick={() => setShowEventForm(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 8 }}
            >
              <i className="fas fa-plus" />
              New Event
            </button>
          )}
        </div>
      </div>

      {/* Scheduling polls strip */}
      {polls.length > 0 && (
        <div className="pm-poll-strip">
          <div className="pm-poll-strip-head">
            <i className="fas fa-calendar-check" style={{ color: 'var(--pm-accent-teal, #00e5cc)' }} />
            Scheduling polls
          </div>
          <div className="pm-poll-strip-cards">
            {polls.map(p => (
              <button key={p.id} type="button" className="pm-poll-card" onClick={() => openPollBoard(p.id)}>
                <span className={`pm-poll-status pm-poll-status-${p.status?.toLowerCase()}`}>{p.status}</span>
                <span className="pm-poll-card-title">{p.title}</span>
                <span className="pm-poll-card-meta">
                  <i className="fas fa-users" /> {p.responderCount ?? 0}
                  {p.status === 'FINALIZED' && p.finalStart && (
                    <> · <i className="fas fa-clock" /> {new Date(p.finalStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</>
                  )}
                  {p.project?.name && <> · {p.project.name}</>}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Error banner */}
      {eventsError && (
        <div style={{
          padding: '10px 16px', marginBottom: 16, borderRadius: 8,
          background: 'rgba(225, 112, 85, 0.12)', border: '1px solid var(--clubpm-accent-red, #e17055)',
          fontSize: 13, color: 'var(--clubpm-accent-red, #e17055)', display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <i className="fas fa-exclamation-triangle" />
          {eventsError}
          <button
            type="button"
            className="cpm-link-btn"
            style={{ marginLeft: 'auto', fontSize: 12 }}
            onClick={() => fetchEvents(cursor)}
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading indicator for events */}
      {eventsLoading && (
        <div style={{ fontSize: 12, color: 'var(--clubpm-text-muted)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
          <i className="fas fa-spinner fa-spin" />
          Loading events…
        </div>
      )}

      {/* Filter bar — applies client-side over the already-fetched events.
          Replaces the project-scoped Calendar tab by letting users narrow to a
          single project / member / event type. */}
      <CalendarFilters
        projects={projects}
        members={members}
        filters={filters}
        onChange={setFilters}
      />

      {/* Calendar — hidden until first fetch completes so the stagger reveal
          plays on a fresh mount rather than re-revealing an already-painted grid. */}
      <div
        ref={calendarWrapRef}
        style={{ visibility: revealed ? 'visible' : 'hidden' }}
      >
        <CalendarView
          tasks={filteredTasks}
          events={filteredEvents}
          onEventClick={setSelectedEvent}
          onEventMove={isAdmin ? handleEventMove : undefined}
        />
      </div>

      {/* FAB for mobile / alternate entry point */}
      {isAdmin && (
        <button
          type="button"
          aria-label="Add event"
          onClick={() => setShowEventForm(true)}
          style={{
            position: 'fixed', bottom: 28, right: 28, zIndex: 200,
            width: 52, height: 52, borderRadius: '50%',
            background: 'var(--clubpm-accent-cyan)',
            border: 'none', cursor: 'pointer', boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, color: '#fff',
          }}
        >
          <i className="fas fa-plus" />
        </button>
      )}

      {/* Event form modal */}
      <EventFormModal
        isOpen={showEventForm}
        onClose={() => { setShowEventForm(false); setEditingEvent(null); }}
        onSave={handleSaveEvent}
        editEvent={editingEvent}
        projects={projects}
        members={members}
      />

      {/* Event detail modal */}
      <EventDetailModal
        event={selectedEvent}
        onClose={() => setSelectedEvent(null)}
        onEdit={(ev) => { setEditingEvent(ev); setShowEventForm(true); }}
        isAdmin={isAdmin}
        projects={projects}
      />

      {/* Meeting poll create/edit modal */}
      <MeetingPollModal
        isOpen={showPollForm}
        onClose={() => { setShowPollForm(false); setEditingPoll(null); }}
        onSave={handleSavePoll}
        editPoll={editingPoll}
        projects={projects}
        members={members}
      />

      {/* Meeting poll board modal.
          Portalled to <body> like every other modal here: .cpm-modal-overlay is
          position:fixed, but a transformed ancestor (the reveal-stagger
          animation on the page) makes it resolve against that ancestor instead
          of the viewport, so rendered inline it scrolled away with the page. */}
      {activePoll && createPortal(
        <div
          className="cpm-modal-overlay"
          onClick={e => { if (e.target === e.currentTarget) setActivePoll(null); }}
        >
          <div className="pm-poll-board-modal" onClick={e => e.stopPropagation()}>
            <MeetingPollBoard
              poll={activePoll}
              suggestion={pollSuggestion}
              onClose={() => setActivePoll(null)}
              onSaveAvailability={handleRespond}
              onFinalize={handleFinalizePoll}
              onRemind={handleRemindPoll}
              onEdit={() => { setEditingPoll(activePoll); setActivePoll(null); setShowPollForm(true); }}
              onDelete={handleDeletePoll}
              onDownloadIcs={() => downloadMeetingPollIcs(activePoll.id, `${activePoll.title || 'meeting'}.ics`)}
              googleUrl={activePoll.finalStart ? googleCalendarUrl({
                title: activePoll.title,
                description: activePoll.description,
                start: activePoll.finalStart,
                end: activePoll.finalEnd ?? activePoll.finalStart,
              }) : null}
            />
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
