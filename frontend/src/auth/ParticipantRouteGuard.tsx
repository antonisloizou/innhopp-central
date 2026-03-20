import { ReactElement } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { isParticipantOnlySession } from './access';

type ParticipantRouteGuardProps = {
  children: ReactElement;
  eventParam?: string;
};

const ParticipantRouteGuard = ({ children, eventParam }: ParticipantRouteGuardProps) => {
  const { user } = useAuth();
  const params = useParams();

  if (!isParticipantOnlySession(user)) {
    return children;
  }

  const eventId = eventParam ? params[eventParam] : undefined;
  const target = eventId ? `/events/${eventId}` : '/events';
  return <Navigate to={target} replace />;
};

export default ParticipantRouteGuard;
