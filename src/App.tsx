import { lazy, Suspense, useEffect, type ReactElement } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { toast } from 'sonner';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/context/AuthContext';
import { useRolePermissions } from '@/hooks/usePermissions';
import { hasPermission } from '@/lib/permissions';
import LoginPage from '@/pages/LoginPage';
import DashboardPage from '@/pages/DashboardPage';
import EmployeesPage from '@/pages/EmployeesPage';
import DependentsPage from '@/pages/DependentsPage';
import TestLibraryPage from '@/pages/TestLibraryPage';
import MedicineLibraryPage from '@/pages/MedicineLibraryPage';
import NewRequestPage from '@/pages/NewRequestPage';
import RequestsPage from '@/pages/RequestsPage';
import UsersPage from '@/pages/UsersPage';
import PermissionMatrixPage from '@/pages/PermissionMatrixPage';
import type { FeatureKey } from '@/types';

const ReportsPage = lazy(() => import('@/pages/ReportsPage'));

function AccessDenied() {
  useEffect(() => {
    toast.error('Access denied');
  }, []);
  return <Navigate to="/dashboard" replace />;
}

function NotFound() {
  useEffect(() => {
    toast.error('Page not found');
  }, []);
  return <Navigate to="/dashboard" replace />;
}

/**
 * Gates a route behind the Master Permission Matrix. Omit featureKey for
 * pages every authenticated user always has (e.g. Dashboard). Admin always
 * passes (see hasPermission) so admin can never be locked out.
 */
function Protected({ featureKey, children }: { featureKey?: FeatureKey; children: ReactElement }) {
  const { user } = useAuth();
  const { data: matrix, isLoading } = useRolePermissions();
  if (!user) return <Navigate to="/login" replace />;
  if (featureKey && user.role !== 'admin') {
    if (isLoading) return null;
    if (!hasPermission(matrix, user.role, featureKey)) return <AccessDenied />;
  }
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <Protected>
            <AppLayout />
          </Protected>
        }
      >
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route
          path="/employees"
          element={
            <Protected featureKey="employees">
              <EmployeesPage />
            </Protected>
          }
        />
        <Route
          path="/dependents"
          element={
            <Protected featureKey="dependents">
              <DependentsPage />
            </Protected>
          }
        />
        <Route
          path="/tests"
          element={
            <Protected featureKey="test_library">
              <TestLibraryPage />
            </Protected>
          }
        />
        <Route
          path="/medicines"
          element={
            <Protected featureKey="medicine_library">
              <MedicineLibraryPage />
            </Protected>
          }
        />
        <Route
          path="/requests/new"
          element={
            <Protected featureKey="new_request">
              <NewRequestPage />
            </Protected>
          }
        />
        <Route
          path="/requests/mine"
          element={
            <Protected featureKey="my_requests">
              <RequestsPage mode="mine" />
            </Protected>
          }
        />
        <Route
          path="/requests/all"
          element={
            <Protected featureKey="all_requests">
              <RequestsPage mode="all" />
            </Protected>
          }
        />
        <Route
          path="/requests/doctor"
          element={
            <Protected featureKey="doctor_queue">
              <RequestsPage mode="doctor" />
            </Protected>
          }
        />
        <Route
          path="/requests/hr"
          element={
            <Protected featureKey="hr_queue">
              <RequestsPage mode="hr" />
            </Protected>
          }
        />
        <Route
          path="/requests/medical"
          element={
            <Protected featureKey="medical_queue">
              <RequestsPage mode="medical" />
            </Protected>
          }
        />
        <Route
          path="/requests/pathology"
          element={
            <Protected featureKey="pathology_queue">
              <RequestsPage mode="pathology" />
            </Protected>
          }
        />
        <Route
          path="/requests/pharmacy"
          element={
            <Protected featureKey="pharmacy_queue">
              <RequestsPage mode="pharmacy" />
            </Protected>
          }
        />
        <Route
          path="/users"
          element={
            <Protected featureKey="system_users">
              <UsersPage />
            </Protected>
          }
        />
        <Route
          path="/reports"
          element={
            <Protected featureKey="reports">
              <Suspense fallback={<div className="p-6 text-sm text-slate-500">Loading…</div>}>
                <ReportsPage />
              </Suspense>
            </Protected>
          }
        />
        <Route
          path="/permissions"
          element={
            <Protected featureKey="permission_matrix">
              <PermissionMatrixPage />
            </Protected>
          }
        />
      </Route>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
