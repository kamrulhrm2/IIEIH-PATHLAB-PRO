import { useMemo, useState, type FormEvent } from 'react';
import { Heart, Pencil, Plus, Search, Trash2, UserCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import { PageHeader } from '@/components/layout/PageHeader';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { EmptyState } from '@/components/shared/EmptyState';
import { RelationBadge } from '@/components/shared/RelationBadge';
import { SearchableSelect } from '@/components/shared/SearchableSelect';
import { useAuth } from '@/context/AuthContext';
import { useDeleteDependent, useDependents, useSaveDependent } from '@/hooks/useDependents';
import { useEmployees } from '@/hooks/useEmployees';
import { formatDate } from '@/lib/utils';
import type { Dependent, GenderType, RelationType } from '@/types';

const RELATIONS: RelationType[] = ['Spouse', 'Father', 'Mother', 'Son', 'Daughter'];
const GENDERS: GenderType[] = ['Male', 'Female', 'Other'];

interface FormState {
  id?: string;
  emp_code: string;
  name: string;
  relation: RelationType | '';
  gender: GenderType | '';
  dob: string;
  contact: string;
}

export default function DependentsPage() {
  const { user } = useAuth();
  const isAdmin = user!.role === 'admin';
  const isAdminOrHr = user!.role === 'admin' || user!.role === 'hr';
  const ownOnly = !isAdminOrHr;
  // Only admin may add / edit / delete dependents; everyone else is view-only.
  const canManage = isAdmin;

  const { data: dependents = [], isLoading } = useDependents(ownOnly ? user!.emp_code : null);
  const { data: employees = [] } = useEmployees();
  const save = useSaveDependent();
  const remove = useDeleteDependent();

  const [search, setSearch] = useState('');
  const [empFilter, setEmpFilter] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>({
    emp_code: ownOnly ? (user!.emp_code ?? '') : '',
    name: '',
    relation: '',
    gender: '',
    dob: '',
    contact: '',
  });
  const [formError, setFormError] = useState('');
  const [deleting, setDeleting] = useState<Dependent | null>(null);

  const empByCode = useMemo(
    () => new Map(employees.map((e) => [e.emp_code, e])),
    [employees]
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return dependents.filter((d) => {
      if (empFilter !== 'all' && d.emp_code !== empFilter) return false;
      if (!q) return true;
      return d.name.toLowerCase().includes(q) || d.relation.toLowerCase().includes(q);
    });
  }, [dependents, search, empFilter]);

  const grouped = useMemo(() => {
    const map = new Map<string, Dependent[]>();
    for (const d of filtered) {
      const list = map.get(d.emp_code) ?? [];
      list.push(d);
      map.set(d.emp_code, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const openAdd = () => {
    setForm({
      emp_code: ownOnly ? (user!.emp_code ?? '') : '',
      name: '',
      relation: '',
      gender: '',
      dob: '',
      contact: '',
    });
    setFormError('');
    setDialogOpen(true);
  };

  const openEdit = (d: Dependent) => {
    setForm({
      id: d.id,
      emp_code: d.emp_code,
      name: d.name,
      relation: d.relation,
      gender: d.gender ?? '',
      dob: d.dob ?? '',
      contact: d.contact ?? '',
    });
    setFormError('');
    setDialogOpen(true);
  };

  const handleSave = (e: FormEvent) => {
    e.preventDefault();
    if (!form.emp_code) {
      setFormError('Employee is required.');
      return;
    }
    if (!form.name.trim()) {
      setFormError('Dependent name is required.');
      return;
    }
    if (!form.relation) {
      setFormError('Relation is required.');
      return;
    }
    save.mutate(
      {
        id: form.id,
        emp_code: form.emp_code,
        name: form.name.trim(),
        relation: form.relation,
        gender: form.gender || null,
        dob: form.dob || null,
        contact: form.contact.trim() || null,
      },
      {
        onSuccess: () => {
          toast.success('Dependent saved successfully');
          setDialogOpen(false);
        },
      }
    );
  };

  return (
    <div>
      <PageHeader
        title="Dependents"
        subtitle="Family members registered for health benefit"
        actions={
          canManage ? (
            <Button onClick={openAdd}>
              <Plus className="h-4 w-4" /> Add Dependent
            </Button>
          ) : undefined
        }
      />

      {isAdminOrHr && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or relation..."
              className="pl-8"
            />
          </div>
          <Select value={empFilter} onValueChange={setEmpFilter}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="All Employees" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Employees</SelectItem>
              {employees.map((e) => (
                <SelectItem key={e.id} value={e.emp_code}>
                  {e.emp_code} — {e.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {isLoading && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      )}

      {!isLoading && grouped.length === 0 && (
        <Card>
          <EmptyState
            icon={Heart}
            title="No dependents registered"
            subtitle={
              canManage
                ? 'Add family members to include them in test requests'
                : 'Contact an administrator to register family members'
            }
            action={
              canManage ? (
                <Button size="sm" onClick={openAdd}>
                  <Plus className="h-4 w-4" /> Add Dependent
                </Button>
              ) : undefined
            }
          />
        </Card>
      )}

      <div className="space-y-8">
        {grouped.map(([empCode, deps]) => {
          const emp = empByCode.get(empCode);
          return (
            <div key={empCode}>
              <div className="mb-3 flex items-center gap-2">
                <UserCheck className="h-4 w-4 text-slate-400" />
                <span className="font-semibold text-slate-900">
                  <span className="font-mono">{empCode}</span>
                  {emp ? ` — ${emp.name}` : ''}
                </span>
                <span className="text-sm text-slate-400">
                  ({deps.length} dependent{deps.length === 1 ? '' : 's'})
                </span>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                {deps.map((d) => (
                  <Card key={d.id} className="transition-shadow hover:shadow-md">
                    <CardContent className="p-4">
                      <div className="mb-2 flex items-center justify-between">
                        <RelationBadge relation={d.relation} />
                        {canManage && (
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => openEdit(d)}
                              aria-label={`Edit ${d.name}`}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => setDeleting(d)}
                              aria-label={`Delete ${d.name}`}
                            >
                              <Trash2 className="h-3.5 w-3.5 text-red-500" />
                            </Button>
                          </div>
                        )}
                      </div>
                      <p className="font-semibold text-slate-900">{d.name}</p>
                      <p className="text-sm text-slate-500">
                        {[d.gender, d.dob ? formatDate(d.dob) : null].filter(Boolean).join(' · ') ||
                          '—'}
                      </p>
                      {d.contact && <p className="text-sm text-slate-500">{d.contact}</p>}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? 'Edit Dependent' : 'Add Dependent'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Employee *</Label>
              {isAdminOrHr ? (
                <SearchableSelect
                  options={employees.map((e) => ({
                    value: e.emp_code,
                    label: `${e.emp_code} — ${e.name}`,
                    sub: e.department ?? undefined,
                  }))}
                  value={form.emp_code || null}
                  onChange={(v) => setForm((f) => ({ ...f, emp_code: v }))}
                  placeholder="Search employee..."
                />
              ) : (
                <Input
                  readOnly
                  value={`${user!.emp_code ?? ''} — ${user!.name}`}
                  className="bg-slate-50 font-mono"
                />
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dep-name">Dependent Name *</Label>
              <Input
                id="dep-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Full name"
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Relation *</Label>
                <Select
                  value={form.relation}
                  onValueChange={(v) => setForm((f) => ({ ...f, relation: v as RelationType }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select relation" />
                  </SelectTrigger>
                  <SelectContent>
                    {RELATIONS.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Gender</Label>
                <Select
                  value={form.gender}
                  onValueChange={(v) => setForm((f) => ({ ...f, gender: v as GenderType }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select gender" />
                  </SelectTrigger>
                  <SelectContent>
                    {GENDERS.map((g) => (
                      <SelectItem key={g} value={g}>
                        {g}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dep-dob">Date of Birth</Label>
                <Input
                  id="dep-dob"
                  type="date"
                  value={form.dob}
                  onChange={(e) => setForm((f) => ({ ...f, dob: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dep-contact">Contact</Label>
                <Input
                  id="dep-contact"
                  value={form.contact}
                  onChange={(e) => setForm((f) => ({ ...f, contact: e.target.value }))}
                  placeholder="017XXXXXXXX"
                />
              </div>
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

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete ${deleting?.name ?? ''}?`}
        description="This dependent will be removed permanently."
        loading={remove.isPending}
        onConfirm={() =>
          deleting &&
          remove.mutate(deleting.id, {
            onSuccess: () => {
              toast.success('Dependent deleted');
              setDeleting(null);
            },
          })
        }
      />
    </div>
  );
}
