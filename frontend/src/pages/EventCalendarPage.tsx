const events = [
  {
    id: 'EVT-2024-05-01',
    name: 'Arctic Fjord Hop',
    location: 'Tromsø, Norway',
    start: '2024-05-01T08:00:00Z',
    end: '2024-05-01T18:00:00Z',
    status: 'Ready for briefings'
  },
  {
    id: 'EVT-2024-05-15',
    name: 'Midnight Sun Formation',
    location: 'Kiruna, Sweden',
    start: '2024-05-15T10:00:00Z',
    end: '2024-05-15T20:00:00Z',
    status: 'Crew assignments pending'
  },
  {
    id: 'EVT-2024-06-05',
    name: 'Lofoten Island Wingsuit Week',
    location: 'Leknes, Norway',
    start: '2024-06-05T07:00:00Z',
    end: '2024-06-10T19:00:00Z',
    status: 'Weather hold - review TAF'
  }
];

const formatDate = (value: string) =>
  new Date(value).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

const EventCalendarPage = () => (
  <section>
    <header className="page-header">
      <div>
        <h2>Season Event Calendar</h2>
        <p>Upcoming experiences with readiness checkpoints and scheduling context.</p>
      </div>
      <button className="primary">Add event</button>
    </header>
    <div className="grid two-column">
      {events.map((event) => (
        <article key={event.id} className="card">
          <header className="card-header">
            <h3>{event.name}</h3>
            <span className="badge">{event.status}</span>
          </header>
          <dl className="card-details">
            <div>
              <dt>Event ID</dt>
              <dd>{event.id}</dd>
            </div>
            <div>
              <dt>Location</dt>
              <dd>{event.location}</dd>
            </div>
            <div>
              <dt>Start</dt>
              <dd>{formatDate(event.start)}</dd>
            </div>
            <div>
              <dt>End</dt>
              <dd>{formatDate(event.end)}</dd>
            </div>
          </dl>
          <footer className="card-footer">
            <button className="secondary">View manifest</button>
            <button className="ghost">Share briefing</button>
          </footer>
        </article>
      ))}
    </div>
  </section>
);

export default EventCalendarPage;
