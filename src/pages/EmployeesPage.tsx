import { useMemo, useRef, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileDown,
  Filter,
  Gauge,
  Loader2,
  Pencil,
  Plus,
  Search,
  Shield,
  Trash2,
  Upload,
  UserCheck,
  X,
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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
import { ExportMenu } from '@/components/shared/ExportMenu';
import { useAuth } from '@/context/AuthContext';
import {
  useBulkInsertEmployees,
  useDeleteEmployee,
  useEmployees,
  useSaveEmployee,
  useSetEmployeesQuota,
  type NewEmployee,
} from '@/hooks/useEmployees';
import { useQuotaLimit } from '@/hooks/useSettings';
import { useBulkUpdateUserRole } from '@/hooks/useUsers';
import { downloadCsv, parseCsv } from '@/lib/csv';
import { cn, formatDate } from '@/lib/utils';
import type { EmpStatus, Employee, UserRole } from '@/types';

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
  const [selectedDepartments, setSelectedDepartments] = useState<Set<string>>(new Set());
  const [selectedDesignations, setSelectedDesignations] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [deleting, setDeleting] = useState<Employee | null>(null);

  // Bulk quota selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkQuota, setBulkQuota] = useState('');

  // Bulk role assignment
  const bulkRole = useBulkUpdateUserRole();
  const [roleOpen, setRoleOpen] = useState(false);
  const [bulkRoleValue, setBulkRoleValue] = useState<UserRole>('user');

  // CSV bulk import
  const bulkInsert = useBulkInsertEmployees();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importFileName, setImportFileName] = useState('');
  const [importRows, setImportRows] = useState<NewEmployee[]>([]);
  const [importErrors, setImportErrors] = useState<string[]>([]);

  const confirmed = employees.filter((e) => e.status === 'confirmed').length;
  const effectiveQuota = (e: Employee) => e.quota_override ?? defaultLimit;

  // Build unique departments and designations lists (alphabetically sorted)
  const allDepartments = useMemo(() => {
    const set = new Set<string>();
    employees.forEach((e) => {
      if (e.department?.trim()) set.add(e.department.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [employees]);

  const allDesignations = useMemo(() => {
    const set = new Set<string>();
    employees.forEach((e) => {
      if (e.designation?.trim()) set.add(e.designation.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [employees]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return employees.filter((e) => {
      if (statusFilter !== 'all' && e.status !== statusFilter) return false;
      // Department filter (OR within, AND with other filters)
      if (selectedDepartments.size > 0) {
        const dept = (e.department ?? '').trim();
        if (!selectedDepartments.has(dept)) return false;
      }
      // Designation filter (OR within, AND with other filters)
      if (selectedDesignations.size > 0) {
        const desig = (e.designation ?? '').trim();
        if (!selectedDesignations.has(desig)) return false;
      }
      if (!q) return true;
      return (
        e.emp_code.toLowerCase().includes(q) ||
        e.name.toLowerCase().includes(q) ||
        (e.department ?? '').toLowerCase().includes(q) ||
        (e.designation ?? '').toLowerCase().includes(q)
      );
    });
  }, [employees, search, statusFilter, selectedDepartments, selectedDesignations]);

  const toggleDepartment = (dept: string) => {
    setSelectedDepartments((prev) => {
      const next = new Set(prev);
      next.has(dept) ? next.delete(dept) : next.add(dept);
      return next;
    });
    setPage(1);
  };

  const toggleDesignation = (desig: string) => {
    setSelectedDesignations((prev) => {
      const next = new Set(prev);
      next.has(desig) ? next.delete(desig) : next.add(desig);
      return next;
    });
    setPage(1);
  };

  const clearAllFilters = () => {
    setSelectedDepartments(new Set());
    setSelectedDesignations(new Set());
    setStatusFilter('all');
    setSearch('');
    setPage(1);
  };

  const hasActiveFilters =
    search.trim() !== '' ||
    statusFilter !== 'all' ||
    selectedDepartments.size > 0 ||
    selectedDesignations.size > 0;

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

  const applyBulkRole = () => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    // Get emp_codes from selected employees
    const empCodes = employees
      .filter((e) => selectedIds.has(e.id))
      .map((e) => e.emp_code);
    if (empCodes.length === 0) return;

    bulkRole.mutate(
      { empCodes, role: bulkRoleValue },
      {
        onSuccess: () => {
          setRoleOpen(false);
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

  const exportHeaders = [
    'Employee Code',
    'Name',
    'Designation',
    'Department',
    'Status',
    'Annual Quota',
    'Quota Type',
    'Join Date',
    'Contact',
  ];
  const exportRows = filtered.map((e) => [
    e.emp_code,
    e.name,
    e.designation,
    e.department,
    e.status,
    effectiveQuota(e),
    e.quota_override != null ? 'Custom' : 'Default',
    e.join_date ? formatDate(e.join_date) : '',
    e.contact,
  ]);

  // ---- CSV bulk import ----
  const IMPORT_COLUMNS = [
    'emp_code',
    'name',
    'designation',
    'department',
    'status',
    'join_date',
    'contact',
    'quota_override',
  ];

  const downloadTemplate = () => {
    downloadCsv('employee-import-template.csv', IMPORT_COLUMNS, [
      ['E101', 'John Doe', 'Officer', 'Production', 'confirmed', '2024-01-15', '01700000000', ''],
      ['E102', 'Jane Smith', 'Executive', 'Finance', 'non-confirmed', '', '', '8'],
    ]);
  };

  const openImport = () => {
    setImportFileName('');
    setImportRows([]);
    setImportErrors([]);
    setImportOpen(true);
  };

  const handleFile = async (file: File) => {
    setImportFileName(file.name);
    setImportRows([]);
    setImportErrors([]);

    const grid = parseCsv(await file.text());
    if (grid.length < 2) {
      setImportErrors(['The file is empty or has no data rows below the header.']);
      return;
    }

    const header = grid[0].map((h) => h.trim().toLowerCase());
    const col = (name: string) => header.indexOf(name);
    const iCode = col('emp_code');
    const iName = col('name');
    if (iCode === -1 || iName === -1) {
      setImportErrors([
        'Missing required columns. The header row must include at least "emp_code" and "name". Download the template for the exact format.',
      ]);
      return;
    }
    const iDesig = col('designation');
    const iDept = col('department');
    const iStatus = col('status');
    const iJoin = col('join_date');
    const iContact = col('contact');
    const iQuota = col('quota_override');

    // Note: We allow existing emp_codes - they will be UPDATED via UPSERT
    // Only file-internal duplicates are rejected
    const seen = new Set<string>();
    const valid: NewEmployee[] = [];
    const errors: string[] = [];
    const cell = (r: string[], i: number) => (i >= 0 ? (r[i] ?? '').trim() : '');

    grid.slice(1).forEach((r, idx) => {
      const line = idx + 2; // account for header + 1-based
      const code = cell(r, iCode).toUpperCase();
      const name = cell(r, iName);

      if (!code) return errors.push(`Row ${line}: employee code is required.`);
      if (!/^[A-Z0-9]{1,20}$/.test(code))
        return errors.push(`Row ${line}: code "${code}" must be alphanumeric (max 20 chars).`);
      if (name.length < 2) return errors.push(`Row ${line}: name is required (min 2 characters).`);
      if (seen.has(code)) return errors.push(`Row ${line}: code ${code} is duplicated in the file.`);

      const status: EmpStatus = cell(r, iStatus).toLowerCase() === 'confirmed' ? 'confirmed' : 'non-confirmed';

      let join_date: string | null = null;
      const j = cell(r, iJoin);
      if (j) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(j))
          return errors.push(`Row ${line}: join_date "${j}" must be in YYYY-MM-DD format.`);
        join_date = j;
      }

      let quota_override: number | null = null;
      const q = cell(r, iQuota);
      if (q) {
        const n = parseInt(q, 10);
        if (!Number.isInteger(n) || n < 0)
          return errors.push(`Row ${line}: quota_override "${q}" must be a whole number (0 or more).`);
        quota_override = n;
      }

      seen.add(code);
      valid.push({
        emp_code: code,
        name,
        designation: cell(r, iDesig) || null,
        department: cell(r, iDept) || null,
        status,
        join_date,
        contact: cell(r, iContact) || null,
        quota_override,
      });
    });

    setImportRows(valid);
    setImportErrors(errors);
  };

  const runImport = () => {
    if (importRows.length === 0) return;
    bulkInsert.mutate(importRows, {
      onSuccess: () => {
        // Detailed toast is shown by the mutation's onSuccess handler in useBulkInsertEmployees
        setImportOpen(false);
        setImportRows([]);
        setImportErrors([]);
        setImportFileName('');
      },
    });
  };

  return (
    <div>
      <PageHeader
        title="Employees"
        subtitle={`${employees.length} total · ${confirmed} confirmed`}
        actions={
          <>
            <ExportMenu
              filename={`employees-${new Date().toISOString().slice(0, 10)}`}
              sheetName="Employees"
              headers={exportHeaders}
              rows={exportRows}
              disabled={filtered.length === 0}
            />
            <Button variant="outline" onClick={openImport}>
              <Upload className="h-4 w-4" /> Import CSV
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
            placeholder="Search code, name, dept, designation..."
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

        {/* Department Multi-Select Filter */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="gap-1.5">
              <Filter className="h-3.5 w-3.5" />
              Department
              {selectedDepartments.size > 0 && (
                <Badge variant="outline" className="ml-1 h-5 bg-slate-900 text-white">
                  {selectedDepartments.size}
                </Badge>
              )}
              <ChevronDown className="h-3.5 w-3.5 opacity-60" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-0" align="start">
            <div className="border-b border-slate-100 px-3 py-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Filter by Department
              </p>
              <p className="mt-0.5 text-xs text-slate-400">
                {selectedDepartments.size === 0
                  ? 'Showing all departments'
                  : `${selectedDepartments.size} selected`}
              </p>
            </div>
            <div className="max-h-64 overflow-y-auto p-2">
              {allDepartments.length === 0 && (
                <p className="px-2 py-3 text-center text-xs text-slate-400">
                  No departments found
                </p>
              )}
              {allDepartments.map((dept) => (
                <label
                  key={dept}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-slate-100"
                >
                  <Checkbox
                    checked={selectedDepartments.has(dept)}
                    onCheckedChange={() => toggleDepartment(dept)}
                  />
                  <span className="flex-1 truncate">{dept}</span>
                </label>
              ))}
            </div>
            {selectedDepartments.size > 0 && (
              <div className="border-t border-slate-100 p-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-xs"
                  onClick={() => {
                    setSelectedDepartments(new Set());
                    setPage(1);
                  }}
                >
                  <X className="h-3 w-3" /> Clear department filter
                </Button>
              </div>
            )}
          </PopoverContent>
        </Popover>

        {/* Designation Multi-Select Filter */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="gap-1.5">
              <Filter className="h-3.5 w-3.5" />
              Designation
              {selectedDesignations.size > 0 && (
                <Badge variant="outline" className="ml-1 h-5 bg-slate-900 text-white">
                  {selectedDesignations.size}
                </Badge>
              )}
              <ChevronDown className="h-3.5 w-3.5 opacity-60" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-0" align="start">
            <div className="border-b border-slate-100 px-3 py-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Filter by Designation
              </p>
              <p className="mt-0.5 text-xs text-slate-400">
                {selectedDesignations.size === 0
                  ? 'Showing all designations'
                  : `${selectedDesignations.size} selected`}
              </p>
            </div>
            <div className="max-h-64 overflow-y-auto p-2">
              {allDesignations.length === 0 && (
                <p className="px-2 py-3 text-center text-xs text-slate-400">
                  No designations found
                </p>
              )}
              {allDesignations.map((desig) => (
                <label
                  key={desig}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-slate-100"
                >
                  <Checkbox
                    checked={selectedDesignations.has(desig)}
                    onCheckedChange={() => toggleDesignation(desig)}
                  />
                  <span className="flex-1 truncate">{desig}</span>
                </label>
              ))}
            </div>
            {selectedDesignations.size > 0 && (
              <div className="border-t border-slate-100 p-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-xs"
                  onClick={() => {
                    setSelectedDesignations(new Set());
                    setPage(1);
                  }}
                >
                  <X className="h-3 w-3" /> Clear designation filter
                </Button>
              </div>
            )}
          </PopoverContent>
        </Popover>

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="text-slate-500"
            onClick={clearAllFilters}
          >
            <X className="h-3.5 w-3.5" /> Clear all
          </Button>
        )}

        <div className="ml-auto text-xs text-slate-500">
          {filtered.length === employees.length
            ? `${employees.length} employees`
            : `${filtered.length} of ${employees.length}`}
        </div>
      </div>

      {/* Active Filter Pills */}
      {(selectedDepartments.size > 0 || selectedDesignations.size > 0) && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          {[...selectedDepartments].map((d) => (
            <Badge
              key={`d-${d}`}
              variant="outline"
              className="gap-1 bg-blue-50 text-blue-700 border-blue-200"
            >
              <span className="text-xs">Dept: {d}</span>
              <button
                type="button"
                onClick={() => toggleDepartment(d)}
                className="hover:text-red-600"
                aria-label={`Remove department ${d}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          {[...selectedDesignations].map((d) => (
            <Badge
              key={`des-${d}`}
              variant="outline"
              className="gap-1 bg-purple-50 text-purple-700 border-purple-200"
            >
              <span className="text-xs">Title: {d}</span>
              <button
                type="button"
                onClick={() => toggleDesignation(d)}
                className="hover:text-red-600"
                aria-label={`Remove designation ${d}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {isAdmin && selectedIds.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-900 bg-slate-900 px-4 py-2.5 text-white">
          <span className="text-sm font-medium">
            {selectedIds.size} employee{selectedIds.size === 1 ? '' : 's'} selected
          </span>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setBulkOpen(true)}>
              <Gauge className="h-4 w-4" /> Set Quota
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setRoleOpen(true)}>
              <Shield className="h-4 w-4" /> Assign Role
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

      {/* Bulk role assignment dialog */}
      <Dialog open={roleOpen} onOpenChange={setRoleOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Assign Role — {selectedIds.size} employee(s)</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              <p className="flex items-start gap-1.5">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  Only updates employees who <strong>already have user accounts</strong>. Employees
                  without accounts will be skipped. To create new accounts, use the System Users
                  page.
                </span>
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bulk-role">System Role</Label>
              <Select
                value={bulkRoleValue}
                onValueChange={(v) => setBulkRoleValue(v as UserRole)}
              >
                <SelectTrigger id="bulk-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">Employee — Submit and track own requests</SelectItem>
                  <SelectItem value="hr">HR — HR queue, employees, reports</SelectItem>
                  <SelectItem value="doctor">Doctor — Doctor queue, own requests</SelectItem>
                  <SelectItem value="pathologist">
                    Pathologist — Pathology queue, test library, slips
                  </SelectItem>
                  <SelectItem value="medical">
                    Medical Services — Medical queue, approve/reject
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-500">
                Admin role can only be assigned individually for security.
              </p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRoleOpen(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={applyBulkRole}
                disabled={bulkRole.isPending || selectedIds.size === 0}
              >
                {bulkRole.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Apply Role to {selectedIds.size}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* CSV bulk import dialog */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Import Employees from CSV</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
              <p>
                Upload a <span className="font-medium">.csv</span> file with a header row. Required
                columns: <span className="font-mono font-semibold">emp_code</span>,{' '}
                <span className="font-mono font-semibold">name</span>. Optional:{' '}
                <span className="font-mono">designation, department, status, join_date, contact,
                quota_override</span>.
              </p>
              <Button
                type="button"
                variant="link"
                className="mt-1 h-auto p-0 text-blue-600"
                onClick={downloadTemplate}
              >
                <FileDown className="h-4 w-4" /> Download template
              </Button>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.target.value = '';
              }}
            />
            <Button
              type="button"
              variant="outline"
              className="w-full justify-start font-normal text-slate-600"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-4 w-4" /> {importFileName || 'Choose CSV file…'}
            </Button>

            {(importRows.length > 0 || importErrors.length > 0) && (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Badge
                    variant="outline"
                    className="bg-emerald-100 text-emerald-800 border-emerald-200"
                  >
                    {importRows.length} ready to import
                  </Badge>
                  {importErrors.length > 0 && (
                    <Badge variant="outline" className="bg-red-100 text-red-800 border-red-200">
                      {importErrors.length} row(s) skipped
                    </Badge>
                  )}
                </div>

                {importRows.length > 0 && (
                  <div className="max-h-40 overflow-auto rounded-lg border border-slate-200">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Code</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead className="hidden sm:table-cell">Department</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {importRows.slice(0, 50).map((r) => (
                          <TableRow key={r.emp_code}>
                            <TableCell className="font-mono text-xs font-bold">
                              {r.emp_code}
                            </TableCell>
                            <TableCell className="text-sm">{r.name}</TableCell>
                            <TableCell className="hidden text-sm text-slate-500 sm:table-cell">
                              {r.department ?? '—'}
                            </TableCell>
                            <TableCell className="text-xs">{r.status}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {importErrors.length > 0 && (
                  <div className="max-h-32 space-y-1 overflow-auto rounded-lg border border-red-200 bg-red-50 p-2">
                    {importErrors.map((err, i) => (
                      <p key={i} className="flex items-start gap-1.5 text-xs text-red-700">
                        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {err}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setImportOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={runImport}
              disabled={bulkInsert.isPending || importRows.length === 0}
            >
              {bulkInsert.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Import {importRows.length || ''} Employee{importRows.length === 1 ? '' : 's'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete ${deleting?.name ?? ''}?`}
        description="This permanently removes the employee along with their login account, dependents, and all of their request history. This cannot be undone."
        loading={remove.isPending}
        onConfirm={() =>
          deleting &&
          remove.mutate(
            { id: deleting.id, empCode: deleting.emp_code },
            {
              onSuccess: () => {
                toast.success('Employee deleted');
                setDeleting(null);
              },
            }
          )
        }
      />
    </div>
  );
}
