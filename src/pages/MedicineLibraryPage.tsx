import { useMemo, useRef, useState, type FormEvent } from 'react';
import { AlertTriangle, FileDown, Loader2, Pencil, Pill, Plus, Search, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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
import { Switch } from '@/components/ui/switch';
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
import {
  useBulkInsertMedicines,
  useDeleteMedicine,
  useMedicines,
  useSaveMedicine,
  type NewMedicine,
} from '@/hooks/useMedicines';
import { downloadCsv, parseCsv } from '@/lib/csv';
import type { Medicine } from '@/types';

const FORMS = ['Tablet', 'Capsule', 'Syrup', 'Injection', 'Drops', 'Ointment', 'Inhaler', 'Other'];

interface FormState {
  id?: string;
  name: string;
  generic_name: string;
  strength: string;
  form: string;
  is_active: boolean;
}

const EMPTY_FORM: FormState = { name: '', generic_name: '', strength: '', form: '', is_active: true };

export default function MedicineLibraryPage() {
  const { data: medicines = [], isLoading } = useMedicines(true);
  const save = useSaveMedicine();
  const remove = useDeleteMedicine();

  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [deleting, setDeleting] = useState<Medicine | null>(null);

  // CSV bulk import
  const bulkInsert = useBulkInsertMedicines();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importFileName, setImportFileName] = useState('');
  const [importRows, setImportRows] = useState<NewMedicine[]>([]);
  const [importErrors, setImportErrors] = useState<string[]>([]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return medicines;
    return medicines.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        (m.generic_name ?? '').toLowerCase().includes(q) ||
        (m.form ?? '').toLowerCase().includes(q)
    );
  }, [medicines, search]);

  const openAdd = () => {
    setForm(EMPTY_FORM);
    setFormError('');
    setDialogOpen(true);
  };

  const openEdit = (m: Medicine) => {
    setForm({
      id: m.id,
      name: m.name,
      generic_name: m.generic_name ?? '',
      strength: m.strength ?? '',
      form: m.form ?? '',
      is_active: m.is_active,
    });
    setFormError('');
    setDialogOpen(true);
  };

  const handleSave = (e: FormEvent) => {
    e.preventDefault();
    if (form.name.trim().length < 2) {
      setFormError('Medicine name is required (min 2 characters).');
      return;
    }
    save.mutate(
      {
        id: form.id,
        name: form.name.trim(),
        generic_name: form.generic_name.trim() || null,
        strength: form.strength.trim() || null,
        form: form.form || null,
        is_active: form.is_active,
      },
      {
        onSuccess: () => {
          toast.success('Medicine saved successfully');
          setDialogOpen(false);
        },
      }
    );
  };

  // ---- CSV bulk import ----
  const IMPORT_COLUMNS = ['name', 'generic_name', 'strength', 'form', 'is_active'];

  const downloadTemplate = () => {
    downloadCsv('medicine-import-template.csv', IMPORT_COLUMNS, [
      ['Napa', 'Paracetamol', '500 mg', 'Tablet', 'true'],
      ['Seclo', 'Omeprazole', '20 mg', 'Capsule', 'true'],
    ]);
  };

  const openImport = () => {
    setImportFileName('');
    setImportRows([]);
    setImportErrors([]);
    setImportOpen(true);
  };

  const handleImportFile = async (file: File) => {
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
    const iName = col('name');
    if (iName === -1) {
      setImportErrors([
        'Missing required column. The header row must include at least "name". Download the template for the exact format.',
      ]);
      return;
    }
    const iGeneric = col('generic_name');
    const iStrength = col('strength');
    const iForm = col('form');
    const iActive = col('is_active');

    const seen = new Set<string>();
    const valid: NewMedicine[] = [];
    const errors: string[] = [];
    const cell = (r: string[], i: number) => (i >= 0 ? (r[i] ?? '').trim() : '');

    grid.slice(1).forEach((r, idx) => {
      const line = idx + 2;
      const name = cell(r, iName);
      if (name.length < 2) return errors.push(`Row ${line}: name is required (min 2 characters).`);

      const strength = cell(r, iStrength) || null;
      const key = `${name.toLowerCase()}|${(strength ?? '').toLowerCase()}`;
      if (seen.has(key))
        return errors.push(`Row ${line}: ${name}${strength ? ` (${strength})` : ''} is duplicated in the file.`);

      const formValue = cell(r, iForm);
      if (formValue && !FORMS.includes(formValue))
        return errors.push(
          `Row ${line}: form "${formValue}" must be one of ${FORMS.join(', ')} (or left blank).`
        );

      const activeRaw = cell(r, iActive).toLowerCase();
      const is_active = activeRaw === '' ? true : activeRaw === 'true' || activeRaw === '1' || activeRaw === 'yes';

      seen.add(key);
      valid.push({
        name,
        generic_name: cell(r, iGeneric) || null,
        strength,
        form: formValue || null,
        is_active,
      });
    });

    setImportRows(valid);
    setImportErrors(errors);
  };

  const runImport = () => {
    if (importRows.length === 0) return;
    bulkInsert.mutate(importRows, {
      onSuccess: () => {
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
        title="Medicine Library"
        subtitle={`${medicines.length} medicine(s) · ${medicines.filter((m) => m.is_active).length} active`}
        actions={
          <>
            <Button variant="outline" onClick={openImport}>
              <Upload className="h-4 w-4" /> Import CSV
            </Button>
            <Button onClick={openAdd}>
              <Plus className="h-4 w-4" /> Add Medicine
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, generic, form..."
            className="pl-8"
          />
        </div>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="hidden md:table-cell">Generic</TableHead>
              <TableHead>Strength</TableHead>
              <TableHead className="hidden sm:table-cell">Form</TableHead>
              <TableHead>Active</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={6}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))}
            {!isLoading && filtered.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={6}>
                  <EmptyState
                    icon={Pill}
                    title="No medicines yet"
                    subtitle="Add medicines so doctors can pick them while prescribing"
                  />
                </TableCell>
              </TableRow>
            )}
            {!isLoading &&
              filtered.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="text-sm font-semibold">{m.name}</TableCell>
                  <TableCell className="hidden text-sm text-slate-500 md:table-cell">
                    {m.generic_name ?? '—'}
                  </TableCell>
                  <TableCell className="text-sm">{m.strength ?? '—'}</TableCell>
                  <TableCell className="hidden sm:table-cell">
                    {m.form ? (
                      <Badge variant="outline" className="bg-slate-50 text-slate-600">
                        {m.form}
                      </Badge>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={m.is_active}
                      onCheckedChange={(v) =>
                        save.mutate(
                          { id: m.id, is_active: v },
                          { onSuccess: () => toast.success(`${m.name} ${v ? 'activated' : 'deactivated'}`) }
                        )
                      }
                      aria-label={`Toggle active for ${m.name}`}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEdit(m)}
                      aria-label={`Edit ${m.name}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleting(m)}
                      aria-label={`Delete ${m.name}`}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </Card>

      {/* Add / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{form.id ? 'Edit Medicine' : 'Add Medicine'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="med-name">Brand / Trade Name *</Label>
              <Input
                id="med-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Napa"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="med-generic">Generic Name</Label>
              <Input
                id="med-generic"
                value={form.generic_name}
                onChange={(e) => setForm((f) => ({ ...f, generic_name: e.target.value }))}
                placeholder="e.g. Paracetamol"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="med-strength">Strength</Label>
                <Input
                  id="med-strength"
                  value={form.strength}
                  onChange={(e) => setForm((f) => ({ ...f, strength: e.target.value }))}
                  placeholder="e.g. 500 mg"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Form</Label>
                <Select
                  value={form.form || undefined}
                  onValueChange={(v) => setForm((f) => ({ ...f, form: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select form" />
                  </SelectTrigger>
                  <SelectContent>
                    {FORMS.map((f) => (
                      <SelectItem key={f} value={f}>
                        {f}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={form.is_active}
                onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
              />
              Active (available to doctors)
            </label>

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

      {/* CSV bulk import dialog */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Import Medicines from CSV</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
              <p>
                Upload a <span className="font-medium">.csv</span> file with a header row. Required
                column: <span className="font-mono font-semibold">name</span>. Optional:{' '}
                <span className="font-mono">
                  generic_name, strength, form ({FORMS.join(', ')}), is_active
                </span>
                . Existing medicines (matched by name + strength) are updated; everything else is
                added as new.
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
                if (f) handleImportFile(f);
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
                          <TableHead>Name</TableHead>
                          <TableHead>Strength</TableHead>
                          <TableHead className="hidden sm:table-cell">Form</TableHead>
                          <TableHead>Active</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {importRows.slice(0, 50).map((m, i) => (
                          <TableRow key={`${m.name}-${m.strength}-${i}`}>
                            <TableCell className="text-sm font-semibold">{m.name}</TableCell>
                            <TableCell className="text-sm">{m.strength ?? '—'}</TableCell>
                            <TableCell className="hidden text-sm text-slate-500 sm:table-cell">
                              {m.form ?? '—'}
                            </TableCell>
                            <TableCell className="text-xs">{m.is_active ? 'Yes' : 'No'}</TableCell>
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
              Import {importRows.length || ''} Medicine{importRows.length === 1 ? '' : 's'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete ${deleting?.name ?? ''}?`}
        description="Existing prescriptions keep their medicine details; this only removes it from the library."
        loading={remove.isPending}
        onConfirm={() =>
          deleting &&
          remove.mutate(deleting.id, {
            onSuccess: () => {
              toast.success('Medicine deleted');
              setDeleting(null);
            },
          })
        }
      />
    </div>
  );
}
