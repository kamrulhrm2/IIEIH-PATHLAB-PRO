import { useMemo, useState, type FormEvent } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Gauge,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { EmptyState } from '@/components/shared/EmptyState';
import { useAuth } from '@/context/AuthContext';
import {
  useDeleteEmployee,
  useEmployees,
  useSaveEmployee,
  useSetEmployeesQuota,
} from '@/hooks/useEmployees';
import { useQuotaLimit } from '@/hooks/useSettings';
import { downloadCsv } from '@/lib/csv';
import { cn, formatDate } from '@/lib/utils';
import type { EmpStatus, Employee } from '@/types';

const PAGE_SIZE = 15;

interface FormState {
  id?: string;
  emp_code: string;
  name: string;
  designation: string;
  department: string;
  status: EmpStatus;
  join_date: string;
  contact: string;
  quota_override: string; // '' = use global default
}

const EMPTY_FORM: FormState = {
  emp_code: '',
  name: '',
  designation: '',
  department: '',
  status: 'non-confirmed',
  join_date: '',
  contact: '',
  quota_override: '',
};

export default function EmployeesPage() {
  const { user } = useAuth();
  const isAdmin = user!.role === 'admin';
  const { data: employees = [], isLoading } = useEmployees();
  const { data: defaultLimit = 5 } = useQuotaLimit();
  const setQuota = useSetEmployeesQuota();
  const save = useSaveEmployee();
  const remove = useDeleteEmployee();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [deleting, setDeleting] = useState<Employee | null>(null);

  // Bulk quota selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkQuota, setBulkQuota] = useState('');

  const confirmed = employees.filter((e) => e.status === 'confirmed').length;
  const effectiveQuota = (e: Employee) => e.quota_override ?? defaultLimit;

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return employees.filter((e) => {
      if (statusFilter !== 'all' && e.status !== statusFilter) return false;
      if (!q) return true;
      return (
        e.emp_code.toLowerCase().includes(q) ||
        e.name.toLowerCase().includes(q) ||
        (e.department ?? '').toLowerCase().includes(q)
      );
    });
  }, [employees, search, statusFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const openAdd = () => {
    setForm(EMPTY_FORM);
    setFormError('');
    setDialogOpen(true);
  };

  const openEdit = (e: Employee) => {
    setForm({
      id: e.id,
      emp_code: e.emp_code,
      name: e.name,
      designation: e.designation ?? '',
      department: e.department ?? '',
      status: e.status,
      join_date: e.join_date ?? '',
      contact: e.contact ?? '',
      quota_override: e.quota_override != null ? String(e.quota_override) : '',
    });
    setFormError('');
    setDialogOpen(true);
  };

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleSelectPage = () =>
    setSelectedIds((prev) => {
      const allSelected = pageRows.every((e) => prev.has(e.id));
      const next = new Set(prev);
      for (const e of pageRows) (allSelected ? next.delete(e.id) : next.add(e.id));
      return next;
    });

  const applyBulkQuota = (clear: boolean) => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    let quota: number | null = null;
    if (!clear) {
      const n = parseInt(bulkQuota, 10);
      if (!Number.isInteger(n) || n < 0) {
        toast.error('Quota must be a whole number (0 or more)');
        return;
      }
      quota = n;
    }
    setQuota.mutate(
      { ids, quota },
      {
        onSuccess: () => {
          toast.success(
            clear
              ? `Reset ${ids.length} employee(s) to the default quota`
              : `Set quota to ${quota} for ${ids.length} employee(s)`
          );
          setBulkOpen(false);
          setBulkQuota('');
          setSelectedIds(new Set());
        },
      }
    );
  };

  const handleSave = (e: FormEvent) => {
    e.preventDefault();
    const code = form.emp_code.trim().toUpperCase();
    if (!code || !/^[A-Za-z0-9]{1,20}$/.test(code)) {
      setFormError('Employee code is required (alphanumeric, max 20 chars).');
      return;
    }
    if (form.name.trim().length < 2) {
      setFormError('Name is required (min 2 characters).');
      return;
    }
    const duplicate = employees.find((x) => x.emp_code === code && x.id !== form.id);
    if (duplicate) {
      setFormError(`Employee code ${code} already exists.`);
      return;
    }
    let quotaOverride: number | null = null;
    if (form.quota_override.trim() !== '') {
      const n = parseInt(form.quota_override, 10);
      if (!Number.isInteger(n) || n < 0) {
        setFormError('Quota override must be a whole number (0 or more), or left blank for default.');
        return;
      }
      quotaOverride = n;
    }
    save.mutate(
      {
        id: form.id,
        emp_code: code,
        name: form.name.trim(),
        designation: form.designation.trim() || null,
        department: form.department.trim() || null,
        status: form.status,
        join_date: form.join_date || null,
        contact: form.contact.trim() || null,
        quota_override: quotaOverride,
      },
      {
        onSuccess: () => {
          toast.success('Employee saved successfully');
          setDialogOpen(false);
        },
      }
    );
  };

  const toggleStatus = (emp: Employee) => {
    save.mutate(
      {
        id: emp.id,
        status: emp.status === 'confirmed' ? 'non-confirmed' : 'confirmed',
      },
      { onSuccess: () => toast.success(`${emp.name} status updated`) }
    );
  };

  const exportCsv = () => {
    downloadCsv(
      `employees-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        'Employee Code',
        'Name',
        'Designation',
        'Department',
        'Status',
        'Annual Quota',
        'Quota Type',
        'Join Date',
        'Contact',
      ],
      filtered.map((e) => [
        e.emp_code,
        e.name,
        e.designation,
        e.department,
        e.status,
        effectiveQuota(e),
        e.quota_override != null ? 'Custom' : 'Default',
        e.join_date ? formatDate(e.join_date) : '',
        e.contact,
      ])
    );
  };

  return (
    <div>
      <PageHeader
        title="Employees"
        subtitle={`${employees.length} total · ${confirmed} confirmed`}
        actions={
          <>
            <Button variant="outline" onClick={exportCsv} disabled={filtered.length === 0}>
              <Download className="h-4 w-4" /> Export CSV
            </Button>
            <Button onClick={openAdd}>
              <Plus className="h-4 w-4" /> Add Employee
            </Button>
          </>
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
            placeholder="Search code, name, department..."
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
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="confirmed">Confirmed</SelectItem>
            <SelectItem value="non-confirmed">Non-Confirmed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isAdmin && selectedIds.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-900 bg-slate-900 px-4 py-2.5 text-white">
          <span className="text-sm font-medium">
            {selectedIds.size} employee{selectedIds.size === 1 ? '' : 's'} selected
          </span>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setBulkOpen(true)}>
              <Gauge className="h-4 w-4" /> Set Quota
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-slate-300 hover:bg-slate-800 hover:text-white"
              onClick={() => setSelectedIds(new Set())}
            >
              Clear
            </Button>
          </div>
        </div>
      )}

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              {isAdmin && (
                <TableHead className="w-8">
                  <Checkbox
                    checked={pageRows.length > 0 && pageRows.every((e) => selectedIds.has(e.id))}
                    onCheckedChange={toggleSelectPage}
                    aria-label="Select all on page"
                  />
                </TableHead>
              )}
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="hidden md:table-cell">Designation</TableHead>
              <TableHead className="hidden md:table-cell">Department</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Quota</TableHead>
              <TableHead className="hidden lg:table-cell">Join Date</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={isAdmin ? 9 : 8}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))}
            {!isLoading && pageRows.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={isAdmin ? 9 : 8}>
                  <EmptyState icon={UserCheck} title="No employees found" />
                </TableCell>
              </TableRow>
            )}
            {!isLoading &&
              pageRows.map((e) => (
                <TableRow key={e.id} data-state={selectedIds.has(e.id) ? 'selected' : undefined}>
                  {isAdmin && (
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(e.id)}
                        onCheckedChange={() => toggleSelect(e.id)}
                        aria-label={`Select ${e.name}`}
                      />
                    </TableCell>
                  )}
                  <TableCell className="font-mono text-sm font-bold">{e.emp_code}</TableCell>
                  <TableCell className="text-sm font-medium">{e.name}</TableCell>
                  <TableCell className="hidden text-sm text-slate-500 md:table-cell">
                    {e.designation ?? '—'}
                  </TableCell>
                  <TableCell className="hidden text-sm text-slate-500 md:table-cell">
                    {e.department ?? '—'}
                  </TableCell>
                  <TableCell>
                    <button
                      onClick={() => toggleStatus(e)}
                      title="Click to toggle status"
                      aria-label={`Toggle status for ${e.name}`}
                    >
                      <Badge
                        variant="outline"
                        className={cn(
                          'cursor-pointer',
                          e.status === 'confirmed'
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                            : 'bg-slate-100 text-slate-600 border-slate-200'
                        )}
                      >
                        {e.status === 'confirmed' ? (
                          <Check className="h-3 w-3" />
                        ) : (
                          <Clock className="h-3 w-3" />
                        )}
                        {e.status === 'confirmed' ? 'Confirmed' : 'Non-Confirmed'}
                      </Badge>
                    </button>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm font-medium">{effectiveQuota(e)}</span>
                    {e.quota_override != null ? (
                      <Badge
                        variant="outline"
                        className="ml-1.5 bg-violet-100 text-violet-800 border-violet-200"
                      >
                        custom
                      </Badge>
                    ) : (
                      <span className="ml-1.5 text-xs text-slate-400">default</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden text-sm text-slate-500 lg:table-cell">
                    {e.join_date ? formatDate(e.join_date) : '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEdit(e)}
                      aria-label={`Edit ${e.name}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleting(e)}
                      aria-label={`Delete ${e.name}`}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>

        {!isLoading && filtered.length > PAGE_SIZE && (
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
            <p className="text-sm text-slate-500">
              Page {currentPage} of {pageCount}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => setPage((p) => p - 1)}>
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

      {/* Add / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? 'Edit Employee' : 'Add Employee'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="emp_code">Employee Code *</Label>
                <Input
                  id="emp_code"
                  value={form.emp_code}
                  onChange={(e) => setForm((f) => ({ ...f, emp_code: e.target.value }))}
                  placeholder="E007"
                  className="font-mono"
                  maxLength={20}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="name">Full Name *</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Full name"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="designation">Designation</Label>
                <Input
                  id="designation"
                  value={form.designation}
                  onChange={(e) => setForm((f) => ({ ...f, designation: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="department">Department</Label>
                <Input
                  id="department"
                  value={form.department}
                  onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select
                  value={form.status}
                  onValueChange={(v) => setForm((f) => ({ ...f, status: v as EmpStatus }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="confirmed">Confirmed</SelectItem>
                    <SelectItem value="non-confirmed">Non-Confirmed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="join_date">Join Date</Label>
                <Input
                  id="join_date"
                  type="date"
                  value={form.join_date}
                  onChange={(e) => setForm((f) => ({ ...f, join_date: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="contact">Contact</Label>
                <Input
                  id="contact"
                  value={form.contact}
                  onChange={(e) => setForm((f) => ({ ...f, contact: e.target.value }))}
                  placeholder="017XXXXXXXX"
                />
              </div>
              {isAdmin && (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="quota_override">Annual Quota Override</Label>
                  <Input
                    id="quota_override"
                    type="number"
                    min={0}
                    step={1}
                    value={form.quota_override}
                    onChange={(e) => setForm((f) => ({ ...f, quota_override: e.target.value }))}
                    placeholder={`Leave blank to use default (${defaultLimit})`}
                    className="font-mono"
                  />
                  <p className="text-xs text-slate-500">
                    Sets this employee's personal yearly limit. Blank = use the global default.
                  </p>
                </div>
              )}
            </div>
            {formError && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {formError}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={save.isPending}>
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Bulk quota dialog */}
      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Set Quota — {selectedIds.size} employee(s)</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="bulk-quota">Annual Quota</Label>
              <Input
                id="bulk-quota"
                type="number"
                min={0}
                step={1}
                value={bulkQuota}
                onChange={(e) => setBulkQuota(e.target.value)}
                placeholder={`e.g. 10`}
                className="font-mono"
                autoFocus
              />
              <p className="text-xs text-slate-500">
                Applies this yearly limit to all selected employees, or reset them to the global
                default ({defaultLimit}).
              </p>
            </div>
            <DialogFooter className="sm:justify-between">
              <Button
                type="button"
                variant="outline"
                onClick={() => applyBulkQuota(true)}
                disabled={setQuota.isPending}
              >
                Reset to default
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="ghost" onClick={() => setBulkOpen(false)}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={() => applyBulkQuota(false)}
                  disabled={setQuota.isPending || bulkQuota.trim() === ''}
                >
                  {setQuota.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Apply Quota
                </Button>
              </div>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete ${deleting?.name ?? ''}?`}
        description="This will also remove their login account and dependents."
        loading={remove.isPending}
        onConfirm={() =>
          deleting &&
          remove.mutate(deleting.id, {
            onSuccess: () => {
              toast.success('Employee deleted');
              setDeleting(null);
            },
          })
        }
      />
    </div>
  );
}
