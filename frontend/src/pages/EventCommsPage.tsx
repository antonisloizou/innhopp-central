import { useParams } from 'react-router-dom';
import CommunicationsPage from './CommunicationsPage';

const EventCommsPage = () => {
  const { eventId } = useParams();
  const parsedEventId = Number(eventId);

  if (!Number.isFinite(parsedEventId) || parsedEventId <= 0) {
    return <p className="error-text">Event not found.</p>;
  }

  return <CommunicationsPage fixedEventId={parsedEventId} />;
};

export default EventCommsPage;
