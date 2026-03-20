import type { AuthSession } from './AuthProvider';

const MANAGEMENT_ROLES = new Set(['admin', 'staff']);

const readRoles = (user?: Pick<AuthSession, 'roles'> | null) =>
  Array.isArray(user?.roles) ? user.roles : [];

export const canManageEvents = (user?: Pick<AuthSession, 'roles'> | null) =>
  readRoles(user).some((role) => MANAGEMENT_ROLES.has(role));

export const canUseStaffMapsActions = (user?: Pick<AuthSession, 'roles'> | null) =>
  readRoles(user).some((role) => MANAGEMENT_ROLES.has(role));

export const isParticipantOnlySession = (user?: Pick<AuthSession, 'roles'> | null) => {
  const roles = readRoles(user);
  return roles.length > 0 && roles.includes('participant') && roles.every((role) => role === 'participant');
};
