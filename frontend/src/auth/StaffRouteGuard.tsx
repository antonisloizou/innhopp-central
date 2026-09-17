import { ReactElement } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { canManageEvents } from './access';

type StaffRouteGuardProps = {
  children: ReactElement;
  allowedRoles?: string[];
};

const StaffRouteGuard = ({ children, allowedRoles = [] }: StaffRouteGuardProps) => {
  const { user } = useAuth();

  if (canManageEvents(user) || user?.roles.some((role) => allowedRoles.includes(role))) {
    return children;
  }

  return <Navigate to="/events" replace />;
};

export default StaffRouteGuard;
