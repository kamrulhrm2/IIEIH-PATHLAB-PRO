import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Download,
  FileText,
  Microscope,
  Search,
  Stethoscope,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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
import { EmptyState } from '@/components/shared/EmptyState';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { useRequestList } from '@/hooks/useRequests';
import { downloadCsv } from '@/lib/csv';
import { cn, formatDate, titleCase } from '@/lib/utils';
import type { QueueMode, RequestStatus, RequestSummary } from '@/types';
import { RequestDetailDialog } from './RequestDetailDialog';

const PAGE_SIZE = 20;

const TITLES: Record<QueueMode, string> = {
  mine: 'My Requests',
  all: 'All Requests',
  doctor: 'Doctor Queue',
  hr: 'HR Queue',
  restricted: 'Restricted (Admin)',
  pathology: 'Pathology Queue',
};

const ALL_STATUSES: RequestStatus[] = [
  'PENDING_DOCTOR',
  'DOCTOR_REJECTED',
  'PENDING_HR',
  'PENDING_HR_PARTIAL',
  'HR_RESTRICTED',
  'PENDING_ADMIN',
  'ADMIN_REJECTED',
  'PENDING_PATHOLOGY',
  'PATH_PARTIAL',
  'COMPLETED',
];

const MODE_STATUSES: Record<QueueMode, RequestStatus[]> = {
  mine: ALL_STATUSES,
  all: ALL_STATUSES,
  doctor: ['PENDING_DOCTOR'],
  hr: ['PENDING_HR', 'PENDING_HR_PARTIAL'],
  restricted: ['HR_RESTRICTED', 'PENDING_ADMIN'],
  pathology: ['PENDING_PATHOLOGY', 'PATH_PARTIAL'],
};

const EMPTY_CONFIG: Record<QueueMode, { icon: LucideIcon; title: string }> = {
  mine: { icon: ClipboardList, title: "You haven't submitted any requests yet" },
  all: { icon: FileText, title: 'No requests in the system yet' },
  doctor: { icon: Stethoscope, title: 'No pending doctor reviews' },
  hr: { icon: Users, title: 'No pending HR approvals' },
  restricted: { icon: AlertTriangle, title: 'No restricted requests' },
  pathology: { icon: Microscope, title: 'No pending pathology tests' },
};

export default function RequestsPage({ mode }: { mode: QueueMode }) {
  const { data: requests = [], isLoading, isError, refetch } = useRequestList(mode);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<RequestSummary | null>(null);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return requests.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (!q) return true;
      return (
        r.req_no.toLowerCase().includes(q) ||
        r.employee_name.toLowerCase().includes(q) ||
        r.employee_code.toLowerCase().includes(q) ||
        r.ben_name.toLowerCase().includes(q)
      );
    });
  }, [requests, search, statusFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const exportCsv = () => {
    downloadCsv(
      `pathlab-requests-${mode}-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        'Req No',
        'Date',
        'Year',
        'Month',
        'Employee Code',
        'Employee Name',
        'Department',
        'Patient',
        'Relation',
        'Approved Tests',
        'Total Tests',
        'Total Cost (BDT)',
        'Status',
        'Requested By',
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
          r.approved_tests,
          r.total_tests,
          Number(r.total_amount),
          r.status,
          r.requester_name,
        ];
      })
    );
  };

  const empty = EMPTY_CONFIG[mode];

  return (
    <div>
      <PageHeader
        title={TITLES[mode]}
        subtitle={`${filtered.length} request(s)`}
        actions={
          <Button variant="outline" onClick={exportCsv} disabled={filtered.length === 0}>
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search req no, employee, patient..."
            className="pl-8"
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-52">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {MODE_STATUSES[mode].map((s) => (
              <SelectItem key={s} value={s}>
                {titleCase(s)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        {isError ? (
          <EmptyState
            icon={AlertTriangle}
            title="Failed to load requests"
            subtitle="Check your connection and try again."
            action={
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                Retry
              </Button>
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Req No</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Employee</TableHead>
                <TableHead>Patient</TableHead>
                <TableHead>Tests</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-8" aria-label="Open" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading &&
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={7}>
                      <Skeleton className="h-6 w-full" />
                    </TableCell>
                  </TableRow>
                ))}
              {!isLoading && pageRows.length === 0 && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={7}>
                    <EmptyState
                      icon={empty.icon}
                      title={empty.title}
                      action={
                        mode === 'mine' ? (
                          <Button asChild size="sm">
                            <Link to="/requests/new">New Request</Link>
                          </Button>
                        ) : undefined
                      }
                    />
                  </TableCell>
                </TableRow>
              )}
              {!isLoading &&
                pageRows.map((r) => (
                  <TableRow key={r.id} className="cursor-pointer" onClick={() => setSelected(r)}>
                    <TableCell className="font-mono text-xs font-bold">{r.req_no}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {formatDate(r.created_at)}
                    </TableCell>
                    <TableCell>
                      <p className="text-sm font-semibold">{r.employee_name}</p>
                      <p className="font-mono text-xs text-slate-500">{r.employee_code}</p>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm">{r.ben_name}</p>
                      <p className="text-xs text-slate-500">{r.ben_relation}</p>
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          'text-sm font-medium',
                          r.total_tests > 0 && r.approved_tests === r.total_tests
                            ? 'text-emerald-600'
                            : 'text-slate-700'
                        )}
                      >
                        {r.approved_tests} / {r.total_tests}
                      </span>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={r.status} />
                    </TableCell>
                    <TableCell>
                      <ChevronRight className="h-4 w-4 text-slate-400" />
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        )}

        {!isLoading && filtered.length > PAGE_SIZE && (
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
            <p className="text-sm text-slate-500">
              Page {currentPage} of {pageCount}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft className="h-4 w-4" /> Prev
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage >= pageCount}
                onClick={() => setPage((p) => p + 1)}
              >
                Next <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      <RequestDetailDialog request={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
