import type { FeatureKey, UserRole } from '@/types';

/** Canonical registry of controllable features — the single source of truth
 * shared by the Sidebar, route guards, and the Permission Matrix page. */
export const FEATURES: { key: FeatureKey; label: string; group: string }[] = [
  { key: 'new_request', label: 'New Request', group: 'Core' },
  { key: 'my_requests', label: 'My Requests', group: 'Core' },
  { key: 'dependents', label: 'Dependents', group: 'Core' },
  { key: 'doctor_queue', label: 'Doctor Queue', group: 'Queues' },
  { key: 'hr_queue', label: 'HR Queue', group: 'Queues' },
  { key: 'medical_queue', label: 'Medical Service Queue', group: 'Queues' },
  { key: 'pathology_queue', label: 'Pathology Queue', group: 'Queues' },
  { key: 'pharmacy_queue', label: 'Pharmacy Queue', group: 'Queues' },
  { key: 'all_requests', label: 'All Requests', group: 'Queues' },
  { key: 'employees', label: 'Employees', group: 'Management' },
  { key: 'test_library', label: 'Test Library', group: 'Management' },
  { key: 'medicine_library', label: 'Medicine Library', group: 'Management' },
  { key: 'system_users', label: 'System Users', group: 'Management' },
  { key: 'reports', label: 'Reports', group: 'Management' },
  { key: 'permission_matrix', label: 'Permission Matrix', group: 'Management' },
];

export const CONTROLLABLE_ROLES: UserRole[] = [
  'hr',
  'doctor',
  'pathologist',
  'medical',
  'pharmacist',
  'user',
];

/** Nested lookup map built from the role_permissions rows. */
export type PermissionMatrix = Partial<Record<UserRole, Partial<Record<FeatureKey, boolean>>>>;

/**
 * Admin ALWAYS passes, regardless of what's stored in the DB — a hard
 * safety guarantee so a mis-click in the matrix can never lock every
 * admin out of the system (defense in depth; the UI also disables and
 * force-checks admin's column).
 */
export function hasPermission(
  matrix: PermissionMatrix | undefined,
  role: UserRole,
  key: FeatureKey
): boolean {
  if (role === 'admin') return true;
  return matrix?.[role]?.[key] ?? false;
}
