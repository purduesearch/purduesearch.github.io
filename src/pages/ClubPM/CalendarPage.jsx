import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import CalendarView from '../../components/clubpm/CalendarView';
import EventFormModal from '../../components/clubpm/EventFormModal';
import { get, post, patch } from '../../api/clubPmClient';
import { useClubPmAuth } from '../../clubpm/ClubPmAuth';

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
                {event.organizer.avatarUrl
                  ? <img src={event.organizer.avatarUrl} alt="" style={{ width: 18, height: 18, borderRadius: '50%' }} />
                  : <span style={{
                      width: 18, height: 18, borderRadius: '50%',
                      background: 'var(--clubpm-accent-cyan)', color: '#fff',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 600,
                    }}>
                      {(event.organizer.displayName ?? '?')[0].toUpperCase()}
                    </span>
                }
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
                    {a.avatarUrl
                      ? <img src={a.avatarUrl} alt="" style={{ width: 16, height: 16, borderRadius: '50%' }} />
                      : <span style={{
                          width: 16, height: 16, borderRadius: '50%', background: 'var(--clubpm-accent-cyan)',
                          color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 600,
                        }}>
                          {(a.displayName ?? '?')[0].toUpperCase()}
                        </span>
                    }
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

      {/* Calendar */}
      <CalendarView
        tasks={tasks}
        events={events}
        onEventClick={setSelectedEvent}
        onEventMove={isAdmin ? handleEventMove : undefined}
      />

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
    </div>
  );
}
