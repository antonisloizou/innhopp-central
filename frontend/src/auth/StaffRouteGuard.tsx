import { ReactElement } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { canManageEvents } from './access';

type StaffRouteGuardProps = {
  children: ReactElement;
};

const StaffRouteGuard = ({ children }: StaffRouteGuardProps) => {
  const { user } = useAuth();

  if (canManageEvents(user)) {
    return children;
  }

  return <Navigate to="/events" replace />;
};

export default StaffRouteGuard;
