import { Fragment, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowUpDown,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
  Hourglass,
  Printer,
  Search,
  UserCheck,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PageHeader } from '@/components/layout/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { useAuth } from '@/context/AuthContext';
import { useEmployeeQuotas } from '@/hooks/useRequests';
import { useQuotaLimit } from '@/hooks/useSettings';
import { downloadCsv } from '@/lib/csv';
import { supabase } from '@/lib/supabase';
import { cn, formatCurrency, formatDate, monthName, titleCase } from '@/lib/utils';
import type { RequestStatus, RequestSummary } from '@/types';

const YEARS = [2024, 2025, 2026];

const STATUS_COLORS: Record<RequestStatus, string> = {
  PENDING_DOCTOR: '#f59e0b',
  PENDING_HR: '#fbbf24',
  PENDING_HR_PARTIAL: '#fcd34d',
  HR_RESTRICTED: '#f97316',
  PENDING_ADMIN: '#fb923c',
  DOCTOR_REJECTED: '#ef4444',
  ADMIN_REJECTED: '#dc2626',
  PENDING_PATHOLOGY: '#8b5cf6',
  PATH_PARTIAL: '#14b8a6',
  COMPLETED: '#10b981',
};

const TERMINAL_REJECTED = ['DOCTOR_REJECTED', 'ADMIN_REJECTED'];

type DeptSortKey = 'department' | 'total' | 'completed' | 'pending' | 'employees' | 'tests' | 'value';

export default function ReportsPage() {
  const { user } = useAuth();
  const isAdmin = user!.role === 'admin';
  const currentYear = new Date().getFullYear();

  const [year, setYear] = useState(currentYear);
  const [dept, setDept] = useState('all');
  const [sortKey, setSortKey] = useState<DeptSortKey>('total');
  const [sortAsc, setSortAsc] = useState(false);
  const [empSearch, setEmpSearch] = useState('');
  const [expandedEmp, setExpandedEmp] = useState<string | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['report', year],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vw_request_summary')
        .select('*')
        .gte('created_at', `${year}-01-01`)
        .lt('created_at', `${year + 1}-01-01`)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as RequestSummary[];
    },
  });

  const { data: quotas = [] } = useEmployeeQuotas();
  const { data: quotaLimit = 5 } = useQuotaLimit();

  const departments = useMemo(
    () => [...new Set(rows.map((r) => r.department).filter((d): d is string => !!d))].sort(),
    [rows]
  );

  const filtered = useMemo(
    () => (dept === 'all' ? rows : rows.filter((r) => r.department === dept)),
    [rows, dept]
  );

  const completed = filtered.filter((r) => r.status === 'COMPLETED').length;
  const pending = filtered.filter(
    (r) => r.status !== 'COMPLETED' && !TERMINAL_REJECTED.includes(r.status)
  ).length;
  const uniqueEmployees = new Set(filtered.map((r) => r.employee_id)).size;
  // #3 — employees who actually availed the facility (have a completed request)
  const employeesAvailed = new Set(
    filtered.filter((r) => r.status === 'COMPLETED').map((r) => r.employee_id)
  ).size;

  const kpis = [
    { label: 'Total Requests', value: filtered.length, icon: FileText, accent: 'bg-blue-100 text-blue-700' },
    { label: 'Completed', value: completed, icon: CheckCircle2, accent: 'bg-emerald-100 text-emerald-700' },
    { label: 'Pending', value: pending, icon: Hourglass, accent: 'bg-amber-100 text-amber-700' },
    { label: 'Unique Employees', value: uniqueEmployees, icon: Users, accent: 'bg-violet-100 text-violet-700' },
    { label: 'Availed Facility', value: employeesAvailed, icon: UserCheck, accent: 'bg-teal-100 text-teal-700' },
  ];

  const monthlyData = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => {
        const m = i + 1;
        const inMonth = filtered.filter((r) => new Date(r.created_at).getMonth() + 1 === m);
        return {
          month: monthName(m),
          Requests: inMonth.length,
          Completed: inMonth.filter((r) => r.status === 'COMPLETED').length,
        };
      }),
    [filtered]
  );

  const statusData = useMemo(() => {
    const counts = new Map<RequestStatus, number>();
    for (const r of filtered) counts.set(r.status, (counts.get(r.status) ?? 0) + 1);
    return [...counts.entries()].map(([status, count]) => ({
      name: titleCase(status),
      value: count,
      color: STATUS_COLORS[status],
    }));
  }, [filtered]);

  const deptSummary = useMemo(() => {
    const map = new Map<
      string,
      {
        department: string;
        total: number;
        completed: number;
        pending: number;
        employees: Set<string>;
        tests: number;
        value: number;
      }
    >();
    for (const r of rows) {
      const key = r.department ?? 'Unassigned';
      const entry =
        map.get(key) ??
        { department: key, total: 0, completed: 0, pending: 0, employees: new Set<string>(), tests: 0, value: 0 };
      entry.total += 1;
      if (r.status === 'COMPLETED') entry.completed += 1;
      else if (!TERMINAL_REJECTED.includes(r.status)) entry.pending += 1;
      entry.employees.add(r.employee_id);
      entry.tests += Number(r.approved_tests); // #2 — tests granted per department
      entry.value += Number(r.approved_amount); // #4 — value of those tests in Tk
      map.set(key, entry);
    }
    const list = [...map.values()].map((e) => ({ ...e, employees: e.employees.size }));
    list.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const cmp =
        typeof av === 'string' && typeof bv === 'string'
          ? av.localeCompare(bv)
          : Number(av) - Number(bv);
      return sortAsc ? cmp : -cmp;
    });
    return list;
  }, [rows, sortKey, sortAsc]);

  // #1 — per-employee history: aggregate totals plus the underlying request list.
  const employeeHistory = useMemo(() => {
    const map = new Map<
      string,
      {
        employee_id: string;
        employee_code: string;
        employee_name: string;
        department: string | null;
        requests: RequestSummary[];
        tests: number;
        value: number;
      }
    >();
    for (const r of filtered) {
      const e =
        map.get(r.employee_id) ??
        {
          employee_id: r.employee_id,
          employee_code: r.employee_code,
          employee_name: r.employee_name,
          department: r.department,
          requests: [] as RequestSummary[],
          tests: 0,
          value: 0,
        };
      e.requests.push(r);
      e.tests += Number(r.approved_tests);
      e.value += Number(r.approved_amount);
      map.set(r.employee_id, e);
    }
    let list = [...map.values()];
    const q = empSearch.toLowerCase().trim();
    if (q) {
      list = list.filter(
        (e) =>
          e.employee_code.toLowerCase().includes(q) || e.employee_name.toLowerCase().includes(q)
      );
    }
    list.sort((a, b) => b.value - a.value);
    return list;
  }, [filtered, empSearch]);

  const toggleSort = (key: DeptSortKey) => {
    if (sortKey === key) setSortAsc((a) => !a);
    else {
      setSortKey(key);
      setSortAsc(key === 'department');
    }
  };

  const exportCsv = async () => {
    const ids = filtered.map((r) => r.id);
    let testNames = new Map<string, string[]>();
    if (ids.length > 0) {
      const { data, error } = await supabase
        .from('request_tests')
        .select('request_id, approval, test:tests(name)')
        .in('request_id', ids)
        .in('approval', ['approved', 'completed']);
      if (error) {
        toast.error(`Export failed — ${error.message}`);
        return;
      }
      for (const rt of data as unknown as { request_id: string; test: { name: string } | null }[]) {
        const list = testNames.get(rt.request_id) ?? [];
        if (rt.test?.name) list.push(rt.test.name);
        testNames.set(rt.request_id, list);
      }
    }
    downloadCsv(
      `IIEIPATH-Report-${year}-${dept === 'all' ? 'AllDepts' : dept}-${Date.now()}.csv`,
      [
        'Req No',
        'Date',
        'Year',
        'Month',
        'Emp Code',
        'Employee Name',
        'Department',
        'Patient',
        'Relation',
        'Approved Tests',
        'Total Tests',
        'Approved Amount (BDT)',
        'Status',
      ],
      filtered.map((r) => {
        const d = new Date(r.created_at);
        return [
          r.req_no,
          formatDate(r.created_at),
          d.getFullYear(),
          d.getMonth() + 1,
          r.employee_code,
          r.employee_name,
          r.department,
          r.ben_name,
          r.ben_relation,
          (testNames.get(r.id) ?? []).join('; '),
          r.total_tests,
          Number(r.approved_amount),
          r.status,
        ];
      })
    );
  };

  return (
    <div>
      <PageHeader
        title="Reports & Analytics"
        subtitle={`Year-to-date insights — ${year}`}
        actions={
          <>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {YEARS.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={dept} onValueChange={setDept}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="All Departments" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Departments</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={exportCsv} disabled={filtered.length === 0}>
              <Download className="h-4 w-4" /> Export CSV
            </Button>
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> Print
            </Button>
          </>
        }
      />

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {kpi.label}
                </p>
                {isLoading ? (
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
        ))}
      </div>

      {/* Charts */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Monthly Requests — {year}</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[260px] w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={monthlyData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
                  />
                  <Bar dataKey="Requests" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Completed" fill="#10b981" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Status Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[260px] w-full" />
            ) : statusData.length === 0 ? (
              <div className="flex h-[260px] items-center justify-center text-sm text-slate-400">
                No data for this selection
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={statusData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={2}
                  >
                    {statusData.map((s) => (
                      <Cell key={s.name} fill={s.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Department summary */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Department Summary</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                {(
                  [
                    ['department', 'Department'],
                    ['total', 'Total Requests'],
                    ['completed', 'Completed'],
                    ['pending', 'Pending'],
                    ['employees', 'Unique Employees'],
                    ['tests', 'Tests'],
                    ['value', 'Value (Tk)'],
                  ] as [DeptSortKey, string][]
                ).map(([key, label]) => (
                  <TableHead key={key}>
                    <button
                      className="flex items-center gap-1 hover:text-slate-900"
                      onClick={() => toggleSort(key)}
                    >
                      {label}
                      <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {deptSummary.length === 0 && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={7} className="py-8 text-center text-sm text-slate-400">
                    No requests for {year}
                  </TableCell>
                </TableRow>
              )}
              {deptSummary.map((d) => (
                <TableRow key={d.department}>
                  <TableCell className="text-sm font-semibold">{d.department}</TableCell>
                  <TableCell className="text-sm">{d.total}</TableCell>
                  <TableCell className="text-sm text-emerald-600">{d.completed}</TableCell>
                  <TableCell className="text-sm text-amber-600">{d.pending}</TableCell>
                  <TableCell className="text-sm">{d.employees}</TableCell>
                  <TableCell className="text-sm font-medium">{d.tests}</TableCell>
                  <TableCell className="text-sm font-semibold">{formatCurrency(d.value)}</TableCell>
                </TableRow>
              ))}
              {deptSummary.length > 0 && (
                <TableRow className="bg-slate-50 font-semibold hover:bg-slate-50">
                  <TableCell className="text-sm">Total</TableCell>
                  <TableCell className="text-sm">
                    {deptSummary.reduce((s, d) => s + d.total, 0)}
                  </TableCell>
                  <TableCell className="text-sm text-emerald-600">
                    {deptSummary.reduce((s, d) => s + d.completed, 0)}
                  </TableCell>
                  <TableCell className="text-sm text-amber-600">
                    {deptSummary.reduce((s, d) => s + d.pending, 0)}
                  </TableCell>
                  <TableCell className="text-sm">—</TableCell>
                  <TableCell className="text-sm">
                    {deptSummary.reduce((s, d) => s + d.tests, 0)}
                  </TableCell>
                  <TableCell className="text-sm">
                    {formatCurrency(deptSummary.reduce((s, d) => s + d.value, 0))}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* #1 — Employee-wise detailed history */}
      <Card className="mt-6">
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-base">Employee Test History</CardTitle>
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={empSearch}
              onChange={(e) => setEmpSearch(e.target.value)}
              placeholder="Search employee..."
              className="pl-8"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" aria-label="Expand" />
                <TableHead>Emp Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="hidden md:table-cell">Department</TableHead>
                <TableHead>Requests</TableHead>
                <TableHead>Tests</TableHead>
                <TableHead>Value (Tk)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employeeHistory.length === 0 && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={7} className="py-8 text-center text-sm text-slate-400">
                    No employee activity for this selection
                  </TableCell>
                </TableRow>
              )}
              {employeeHistory.map((e) => {
                const open = expandedEmp === e.employee_id;
                return (
                  <Fragment key={e.employee_id}>
                    <TableRow
                      className="cursor-pointer"
                      onClick={() => setExpandedEmp(open ? null : e.employee_id)}
                    >
                      <TableCell>
                        {open ? (
                          <ChevronDown className="h-4 w-4 text-slate-400" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-slate-400" />
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-sm font-bold">
                        {e.employee_code}
                      </TableCell>
                      <TableCell className="text-sm font-medium">{e.employee_name}</TableCell>
                      <TableCell className="hidden text-sm text-slate-500 md:table-cell">
                        {e.department ?? '—'}
                      </TableCell>
                      <TableCell className="text-sm">{e.requests.length}</TableCell>
                      <TableCell className="text-sm">{e.tests}</TableCell>
                      <TableCell className="text-sm font-semibold">
                        {formatCurrency(e.value)}
                      </TableCell>
                    </TableRow>
                    {open && (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={7} className="bg-slate-50 p-0">
                          <div className="p-3">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Req No</TableHead>
                                  <TableHead>Date</TableHead>
                                  <TableHead>Patient</TableHead>
                                  <TableHead>Tests</TableHead>
                                  <TableHead>Value (Tk)</TableHead>
                                  <TableHead>Status</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {e.requests.map((r) => (
                                  <TableRow key={r.id}>
                                    <TableCell className="font-mono text-xs font-bold">
                                      {r.req_no}
                                    </TableCell>
                                    <TableCell className="whitespace-nowrap text-sm">
                                      {formatDate(r.created_at)}
                                    </TableCell>
                                    <TableCell className="text-sm">
                                      {r.ben_name}{' '}
                                      <span className="text-slate-400">· {r.ben_relation}</span>
                                    </TableCell>
                                    <TableCell className="text-sm">
                                      {r.approved_tests}/{r.total_tests}
                                    </TableCell>
                                    <TableCell className="text-sm">
                                      {formatCurrency(r.approved_amount)}
                                    </TableCell>
                                    <TableCell>
                                      <StatusBadge status={r.status} />
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Employee quota table (admin only, current year) */}
      {isAdmin && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">
              Employee Benefit Quota — {currentYear}{' '}
              <span className="font-normal text-slate-400">(limit {quotaLimit}/year)</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Emp Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="hidden md:table-cell">Department</TableHead>
                  <TableHead>Used</TableHead>
                  <TableHead>Remaining</TableHead>
                  <TableHead className="w-48">Quota</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {quotas.map((q) => {
                  const barColor = q.exceeded
                    ? 'bg-red-500'
                    : q.remaining <= 2
                      ? 'bg-amber-500'
                      : 'bg-emerald-500';
                  return (
                    <TableRow key={q.id}>
                      <TableCell className="font-mono text-sm font-bold">{q.emp_code}</TableCell>
                      <TableCell className="text-sm font-medium">{q.name}</TableCell>
                      <TableCell className="hidden text-sm text-slate-500 md:table-cell">
                        {q.department ?? '—'}
                      </TableCell>
                      <TableCell className="text-sm">{q.used}</TableCell>
                      <TableCell className="text-sm">{q.remaining}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress
                            value={Math.min((q.used / quotaLimit) * 100, 100)}
                            className="flex-1"
                            indicatorClassName={barColor}
                          />
                          <span className="text-xs font-semibold text-slate-600">
                            {q.used}/{quotaLimit}
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
