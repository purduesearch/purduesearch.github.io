import PublicCalendarMenu from './PublicCalendarMenu';
import { typeConfig, dateTile, formatTimeRange, formatDayKey, purdueDayKey } from '../../lib/publicEvents';
import { googleAddUrl, outlookAddUrl, eventIcsUrl } from '../../lib/calendarLinks';

export default function PublicEventCard({ event, expanded, onToggle }) {
  const cfg = typeConfig(event.type);
  const tile = dateTile(event.startTime);
  const descId = `home-event-desc-${event.id}`;

  const addItems = [
    { label: 'Google Calendar', icon: 'fab fa-google', href: googleAddUrl(event), external: true },
    { label: 'Outlook.com', icon: 'fab fa-microsoft', href: outlookAddUrl(event, 'live'), external: true },
    { label: 'Microsoft 365 (Purdue)', icon: 'fas fa-building', href: outlookAddUrl(event, 'office'), external: true },
    { label: 'Apple / other (.ics)', icon: 'fas fa-download', href: eventIcsUrl(event.id) },
  ];

  return (
    <article className="home-events-card" style={{ '--event-color': cfg.color }}>
      <div className="home-events-date" aria-hidden="true">
        <span className="home-events-date-month">{tile.month}</span>
        <span className="home-events-date-day">{tile.day}</span>
        <span className="home-events-date-weekday">{tile.weekday}</span>
      </div>

      <div className="home-events-card-body">
        <span className="home-events-type">
          <i className={cfg.icon} aria-hidden="true" />
          {cfg.label}
        </span>
        <h3 className="home-events-card-title">{event.title}</h3>
        <p className="home-events-meta">
          <span>
            <i className="fas fa-clock" aria-hidden="true" />
            <span className="sr-only">{formatDayKey(purdueDayKey(event.startTime))}, </span>
            {formatTimeRange(event.startTime, event.endTime)}
          </span>
          <span>
            <i className={event.isVirtual ? 'fas fa-video' : 'fas fa-map-marker-alt'} aria-hidden="true" />
            {event.isVirtual ? 'Online' : (event.location || 'Location TBA')}
          </span>
        </p>
        {event.description && (
          <>
            <button
              type="button"
              className="home-events-more"
              aria-expanded={expanded}
              aria-controls={descId}
              onClick={onToggle}
            >
              {expanded ? 'Hide details' : 'Details'}
              <i className="fas fa-chevron-down home-events-menu-caret" aria-hidden="true" />
            </button>
            <p id={descId} className="home-events-desc" hidden={!expanded}>{event.description}</p>
          </>
        )}
      </div>

      <div className="home-events-card-actions">
        <PublicCalendarMenu
          label="Add"
          ariaLabel={`Add ${event.title} to your calendar`}
          icon="fas fa-calendar-plus"
          items={addItems}
          align="right"
          variant="ghost"
        />
      </div>
    </article>
  );
}
