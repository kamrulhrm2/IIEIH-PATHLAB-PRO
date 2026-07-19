import { lazy, Suspense, useEffect, type ReactElement } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { toast } from 'sonner';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/context/AuthContext';
import LoginPage from '@/pages/LoginPage';
import DashboardPage from '@/pages/DashboardPage';
import EmployeesPage from '@/pages/EmployeesPage';
import DependentsPage from '@/pages/DependentsPage';
import TestLibraryPage from '@/pages/TestLibraryPage';
import MedicineLibraryPage from '@/pages/MedicineLibraryPage';
import NewRequestPage from '@/pages/NewRequestPage';
import RequestsPage from '@/pages/RequestsPage';
import UsersPage from '@/pages/UsersPage';
import type { UserRole } from '@/types';

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

function Protected({ roles, children }: { roles?: UserRole[]; children: ReactElement }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <AccessDenied />;
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
            <Protected roles={['admin', 'hr']}>
              <EmployeesPage />
            </Protected>
          }
        />
        <Route path="/dependents" element={<DependentsPage />} />
        <Route
          path="/tests"
          element={
            <Protected roles={['admin']}>
              <TestLibraryPage />
            </Protected>
          }
        />
        <Route
          path="/medicines"
          element={
            <Protected roles={['admin', 'doctor', 'pharmacist']}>
              <MedicineLibraryPage />
            </Protected>
          }
        />
        <Route
          path="/requests/new"
          element={
            <Protected>
              <NewRequestPage />
            </Protected>
          }
        />
        <Route
          path="/requests/mine"
          element={
            <Protected roles={['admin', 'doctor', 'pathologist', 'medical', 'user']}>
              <RequestsPage mode="mine" />
            </Protected>
          }
        />
        <Route
          path="/requests/all"
          element={
            <Protected roles={['admin']}>
              <RequestsPage mode="all" />
            </Protected>
          }
        />
        <Route
          path="/requests/doctor"
          element={
            <Protected roles={['admin', 'doctor']}>
              <RequestsPage mode="doctor" />
            </Protected>
          }
        />
        <Route
          path="/requests/hr"
          element={
            <Protected roles={['admin', 'hr']}>
              <RequestsPage mode="hr" />
            </Protected>
          }
        />
        <Route
          path="/requests/restricted"
          element={
            <Protected roles={['admin']}>
              <RequestsPage mode="restricted" />
            </Protected>
          }
        />
        <Route
          path="/requests/medical"
          element={
            <Protected roles={['admin', 'medical']}>
              <RequestsPage mode="medical" />
            </Protected>
          }
        />
        <Route
          path="/requests/pathology"
          element={
            <Protected roles={['admin', 'pathologist']}>
              <RequestsPage mode="pathology" />
            </Protected>
          }
        />
        <Route
          path="/requests/pharmacy"
          element={
            <Protected roles={['admin', 'pharmacist']}>
              <RequestsPage mode="pharmacy" />
            </Protected>
          }
        />
        <Route
          path="/users"
          element={
            <Protected roles={['admin']}>
              <UsersPage />
            </Protected>
          }
        />
        <Route
          path="/reports"
          element={
            <Protected roles={['admin']}>
              <Suspense fallback={<div className="p-6 text-sm text-slate-500">Loading…</div>}>
                <ReportsPage />
              </Suspense>
            </Protected>
          }
        />
      </Route>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
