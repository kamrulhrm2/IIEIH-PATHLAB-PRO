import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  FileText,
  Gauge,
  Hourglass,
  Microscope,
  Stethoscope,
  UserCheck,
  Users,
  type LucideIcon,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/layout/PageHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { ROLE_LABELS } from '@/components/shared/RoleBadge';
import { useAuth } from '@/context/AuthContext';
import { useEmployees } from '@/hooks/useEmployees';
import { useEmployeeUsage, useRequestList } from '@/hooks/useRequests';
import { useQuotaLimit } from '@/hooks/useSettings';
import { cn, formatDate, monthName } from '@/lib/utils';
import type { RequestSummary } from '@/types';
import { RequestDetailDialog } from './RequestDetailDialog';

const TERMINAL_REJECTED = ['DOCTOR_REJECTED', 'ADMIN_REJECTED'];

interface Kpi {
  label: string;
  value: number;
  icon: LucideIcon;
  accent: string;
}

function KpiCard({ kpi, loading }: { kpi: Kpi; loading: boolean }) {
  return (
    <Card className="transition-colors hover:border-slate-300">
      <CardContent className="flex items-center justify-between p-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{kpi.label}</p>
          {loading ? (
            <Skeleton className="mt-1 h-8 w-12" />
          ) : (
            <p className="text-3xl font-bold text-slate-900">{kpi.value}</p>
          )}
        </div>
        <div className={cn('rounded-lg p-2.5', kpi.accent)}>
          <kpi.icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const role = user!.role;
  const listMode = role === 'user' ? 'mine' : 'all';
  const { data: requests = [], isLoading } = useRequestList(listMode);
  const { data: employees = [] } = useEmployees();
  const [selected, setSelected] = useState<RequestSummary | null>(null);

  const myEmployee = employees.find((e) => e.emp_code === user!.emp_code);
  const { data: myUsage = 0 } = useEmployeeUsage(myEmployee?.id);
  const { data: quotaLimit = 5 } = useQuotaLimit();

  const year = new Date().getFullYear();
  const yearRequests = useMemo(
    () => requests.filter((r) => new Date(r.created_at).getFullYear() === year),
    [requests, year]
  );
  const mine = useMemo(() => requests.filter((r) => r.requester_id === user!.id), [requests, user]);

  const remaining = Math.max(quotaLimit - myUsage, 0);

  const kpis: Kpi[] = useMemo(() => {
    const count = (fn: (r: RequestSummary) => boolean) => requests.filter(fn).length;
    switch (role) {
      case 'admin':
        return [
          { label: 'Total Requests', value: requests.length, icon: FileText, accent: 'bg-rose-100 text-rose-700' },
          {
            label: 'Pending Actions',
            value: count((r) => r.status !== 'COMPLETED' && !TERMINAL_REJECTED.includes(r.status)),
            icon: Hourglass,
            accent: 'bg-amber-100 text-amber-700',
          },
          { label: 'Completed', value: count((r) => r.status === 'COMPLETED'), icon: CheckCircle2, accent: 'bg-emerald-100 text-emerald-700' },
          { label: 'Total Employees', value: employees.length, icon: Users, accent: 'bg-blue-100 text-blue-700' },
        ];
      case 'hr':
        return [
          {
            label: 'HR Queue',
            value: count((r) => r.status === 'PENDING_HR' || r.status === 'PENDING_HR_PARTIAL'),
            icon: Users,
            accent: 'bg-amber-100 text-amber-700',
          },
          {
            label: 'Restricted',
            value: count((r) => r.status === 'HR_RESTRICTED' || r.status === 'PENDING_ADMIN'),
            icon: AlertTriangle,
            accent: 'bg-orange-100 text-orange-700',
          },
          { label: 'Total Employees', value: employees.length, icon: UserCheck, accent: 'bg-blue-100 text-blue-700' },
          {
            label: 'Confirmed',
            value: employees.filter((e) => e.status === 'confirmed').length,
            icon: CheckCircle2,
            accent: 'bg-emerald-100 text-emerald-700',
          },
        ];
      case 'doctor':
        return [
          {
            label: 'Doctor Queue',
            value: count((r) => r.status === 'PENDING_DOCTOR' && r.assigned_doctor_id === user!.id),
            icon: Stethoscope,
            accent: 'bg-emerald-100 text-emerald-700',
          },
          { label: 'My Requests', value: mine.length, icon: ClipboardList, accent: 'bg-blue-100 text-blue-700' },
          { label: 'My Completed', value: mine.filter((r) => r.status === 'COMPLETED').length, icon: CheckCircle2, accent: 'bg-emerald-100 text-emerald-700' },
          { label: 'Remaining Quota', value: remaining, icon: Gauge, accent: 'bg-violet-100 text-violet-700' },
        ];
      case 'pathologist':
        return [
          {
            label: 'Pathology Queue',
            value: count((r) => r.status === 'PENDING_PATHOLOGY' || r.status === 'PATH_PARTIAL'),
            icon: Microscope,
            accent: 'bg-violet-100 text-violet-700',
          },
          { label: 'My Requests', value: mine.length, icon: ClipboardList, accent: 'bg-blue-100 text-blue-700' },
          { label: 'My Completed', value: mine.filter((r) => r.status === 'COMPLETED').length, icon: CheckCircle2, accent: 'bg-emerald-100 text-emerald-700' },
          { label: 'Remaining Quota', value: remaining, icon: Gauge, accent: 'bg-violet-100 text-violet-700' },
        ];
      default:
        return [
          { label: 'My Requests', value: requests.length, icon: ClipboardList, accent: 'bg-blue-100 text-blue-700' },
          {
            label: 'Pending',
            value: count((r) => r.status !== 'COMPLETED' && !TERMINAL_REJECTED.includes(r.status)),
            icon: Hourglass,
            accent: 'bg-amber-100 text-amber-700',
          },
          { label: 'Completed', value: count((r) => r.status === 'COMPLETED'), icon: CheckCircle2, accent: 'bg-emerald-100 text-emerald-700' },
          { label: 'Remaining Quota', value: remaining, icon: Gauge, accent: 'bg-blue-100 text-blue-700' },
        ];
    }
  }, [role, requests, employees, mine, remaining]);

  const showQuotaCard = role === 'doctor' || role === 'pathologist' || role === 'user';
  const quotaRatio = quotaLimit > 0 ? remaining / quotaLimit : 0;
  const quotaBarColor =
    quotaRatio <= 0 ? 'bg-red-500' : quotaRatio <= 0.4 ? 'bg-amber-500' : 'bg-emerald-500';

  const chartData = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => {
        const m = i + 1;
        const inMonth = yearRequests.filter((r) => new Date(r.created_at).getMonth() + 1 === m);
        return {
          month: monthName(m),
          requests: inMonth.length,
          completed: inMonth.filter((r) => r.status === 'COMPLETED').length,
        };
      }),
    [yearRequests]
  );

  const recent = requests.slice(0, 6);

  return (
    <div>
      <PageHeader
        title={`Welcome back, ${user!.name}`}
        subtitle={`Signed in as ${ROLE_LABELS[role]} · ${year}`}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) =>
          kpi.label === 'Remaining Quota' && showQuotaCard ? (
            <Card key={kpi.label} className="transition-colors hover:border-slate-300">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      {kpi.label}
                    </p>
                    <p className="text-3xl font-bold text-slate-900">{kpi.value}</p>
                  </div>
                  <div className={cn('rounded-lg p-2.5', kpi.accent)}>
                    <kpi.icon className="h-5 w-5" />
                  </div>
                </div>
                <p className="mt-2 text-xs text-slate-500">{remaining} of {quotaLimit} remaining</p>
                <Progress
                  value={(remaining / quotaLimit) * 100}
                  className="mt-1.5"
                  indicatorClassName={quotaBarColor}
                />
              </CardContent>
            </Card>
          ) : (
            <KpiCard key={kpi.label} kpi={kpi} loading={isLoading} />
          )
        )}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-5">
        {/* Monthly chart */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-base">Monthly Activity — {year}</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[240px] w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 8,
                      border: '1px solid #e2e8f0',
                      fontSize: 12,
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="requests"
                    name="Requests"
                    stroke="#3b82f6"
                    fill="#3b82f6"
                    fillOpacity={0.2}
                  />
                  <Area
                    type="monotone"
                    dataKey="completed"
                    name="Completed"
                    stroke="#10b981"
                    fill="#10b981"
                    fillOpacity={0.2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Recent requests */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Recent Requests</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {isLoading &&
              Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            {!isLoading && recent.length === 0 && (
              <EmptyState
                icon={ClipboardList}
                title="No requests yet"
                action={
                  <Button asChild size="sm">
                    <Link to="/requests/new">Submit your first request</Link>
                  </Button>
                }
              />
            )}
            {!isLoading &&
              recent.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setSelected(r)}
                  className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left transition-colors hover:bg-slate-50"
                >
                  <div className="min-w-0">
                    <p className="font-mono text-xs font-bold text-slate-900">{r.req_no}</p>
                    <p className="truncate text-xs text-slate-500">
                      {r.ben_name} · {r.ben_relation}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <StatusBadge status={r.status} className="text-[10px]" />
                    <span className="hidden text-xs text-slate-400 sm:block">
                      {formatDate(r.created_at)}
                    </span>
                  </div>
                </button>
              ))}
          </CardContent>
        </Card>
      </div>

      <RequestDetailDialog request={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
