import { ReactNode } from 'react';
import { Link, To } from 'react-router-dom';
import { formatEventLocalDate } from '../utils/eventDate';
import { incompleteProfileWarning } from '../utils/profileCompleteness';

export type ParticipantListItem = {
  id: number;
  full_name: string;
  email?: string;
  jump_count?: number;
  years_in_sport?: number;
  eventCount: number;
  registeredAt: string;
  profileIncomplete: boolean;
};

export type ParticipantListSortField = 'name' | 'registrationDate' | 'eventCount';
export type ParticipantListSort = { field: ParticipantListSortField; direction: 'asc' | 'desc' };

type ParticipantListProps = {
  title: string;
  singular: string;
  people: ParticipantListItem[];
  open: boolean;
  onToggle: () => void;
  sort: ParticipantListSort;
  onSort: (field: ParticipantListSortField) => void;
  loading?: boolean;
  error?: string | null;
  participantLink: (participant: ParticipantListItem) => To;
  renderName?: (name: string) => ReactNode;
  countLabel?: ReactNode;
  headerAction?: ReactNode;
  toolbar?: ReactNode;
  thirdColumnLabel?: string;
  thirdColumnSortable?: boolean;
  renderThirdColumn?: (participant: ParticipantListItem) => ReactNode;
};

const SortIcon = ({ sort, field }: { sort: ParticipantListSort; field: ParticipantListSortField }) => (
  <span className="participant-onboarding-sort-icon" aria-hidden="true">
    <span className={`material-symbols-outlined ${sort.field === field && sort.direction === 'asc' ? 'is-active' : ''}`}>
      keyboard_arrow_up
    </span>
    <span className={`material-symbols-outlined ${sort.field === field && sort.direction === 'desc' ? 'is-active' : ''}`}>
      keyboard_arrow_down
    </span>
  </span>
);

const ParticipantList = ({
  title,
  singular,
  people,
  open,
  onToggle,
  sort,
  onSort,
  loading = false,
  error = null,
  participantLink,
  renderName = (name) => name,
  countLabel,
  headerAction,
  toolbar,
  thirdColumnLabel = 'Events',
  thirdColumnSortable = true,
  renderThirdColumn = (participant) => (
    <span className="badge neutral participant-onboarding-event-count">
      {participant.eventCount} {participant.eventCount === 1 ? 'event' : 'events'}
    </span>
  )
}: ParticipantListProps) => (
  <article className="card">
    <header className="card-header event-detail-section-header" onClick={onToggle}>
      <div className="event-detail-section-header-main">
        <button
          className="ghost"
          type="button"
          aria-label={`${open ? 'Collapse' : 'Expand'} ${title}`}
          aria-expanded={open}
          onClick={(event) => {
            event.stopPropagation();
            onToggle();
          }}
        >
          {open ? '▾' : '▸'}
        </button>
        <h3 className="event-detail-section-title">{title}</h3>
      </div>
      <div className="participant-list-header-actions">
        {headerAction}
        <span className="badge neutral participant-onboarding-event-count">
          {countLabel ?? `${people.length} ${people.length === 1 ? singular : title.toLowerCase()}`}
        </span>
      </div>
    </header>
    {open ? (
      <>
        {toolbar}
        <div className="participant-onboarding-table-header">
          <button
            className="ghost participant-onboarding-sort-button"
            type="button"
            onClick={() => onSort('name')}
            aria-label={`Sort by name${sort.field === 'name' ? `, currently ${sort.direction === 'asc' ? 'A to Z' : 'Z to A'}` : ''}`}
          >
            Name <SortIcon sort={sort} field="name" />
          </button>
          <button
            className="ghost participant-onboarding-sort-button"
            type="button"
            onClick={() => onSort('registrationDate')}
            aria-label={`Sort by registration date${sort.field === 'registrationDate' ? `, currently ${sort.direction === 'asc' ? 'oldest first' : 'newest first'}` : ''}`}
          >
            Registration date <SortIcon sort={sort} field="registrationDate" />
          </button>
          {thirdColumnSortable ? (
            <button
              className="ghost participant-onboarding-sort-button participant-onboarding-events-sort-button"
              type="button"
              onClick={() => onSort('eventCount')}
              aria-label={`Sort by number of ${thirdColumnLabel.toLowerCase()}${sort.field === 'eventCount' ? `, currently ${sort.direction === 'asc' ? 'fewest first' : 'most first'}` : ''}`}
            >
              {thirdColumnLabel} <SortIcon sort={sort} field="eventCount" />
            </button>
          ) : <span className="participant-onboarding-sort-button participant-onboarding-events-sort-button">{thirdColumnLabel}</span>}
        </div>
        {loading ? (
          <p className="muted">Loading {title.toLowerCase()}…</p>
        ) : error ? (
          <p className="error-text">{error}</p>
        ) : people.length === 0 ? (
          <p className="muted">No {title.toLowerCase()} match the selected filters.</p>
        ) : (
          <ul className="status-list">
            {people.map((participant) => (
              <li key={participant.id}>
                <Link to={participantLink(participant)} className="card-link participant-onboarding-card-link">
                  <strong>
                    {renderName(participant.full_name)}
                    {participant.profileIncomplete ? (
                      <span
                        className="nav-user-warning participant-onboarding-profile-warning"
                        title={incompleteProfileWarning}
                        aria-label={incompleteProfileWarning}
                      >
                        !
                      </span>
                    ) : null}
                  </strong>
                  <div className="muted">{participant.email || 'No email on file'}</div>
                  <div className="muted">
                    Jumps: {typeof participant.jump_count === 'number' ? participant.jump_count : '-'} · Years in sport:{' '}
                    {typeof participant.years_in_sport === 'number' ? participant.years_in_sport : '-'}
                  </div>
                </Link>
                <time className="muted participant-onboarding-registration-date" dateTime={participant.registeredAt}>
                  {participant.registeredAt ? formatEventLocalDate(participant.registeredAt) : 'Unknown'}
                </time>
                {renderThirdColumn(participant)}
              </li>
            ))}
          </ul>
        )}
      </>
    ) : null}
  </article>
);

export default ParticipantList;
