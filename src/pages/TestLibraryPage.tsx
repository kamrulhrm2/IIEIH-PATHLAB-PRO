import { useMemo, useRef, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  FileDown,
  FlaskConical,
  FolderPlus,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
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
import { ExportMenu } from '@/components/shared/ExportMenu';
import { useAuth } from '@/context/AuthContext';
import {
  useBulkInsertTests,
  useCreateTestCategory,
  useDeleteTest,
  useSaveTest,
  useTestCategories,
  useTests,
  type NewLabTest,
} from '@/hooks/useTests';
import { downloadCsv, parseCsv } from '@/lib/csv';
import { cn, formatCurrency } from '@/lib/utils';
import type { LabTest } from '@/types';

interface FormState {
  id?: string;
  code: string;
  name: string;
  category: string;
  price: string;
  is_active: boolean;
}

const EMPTY_FORM: FormState = { code: '', name: '', category: '', price: '', is_active: true };

export default function TestLibraryPage() {
  const { user } = useAuth();
  const isAdmin = user!.role === 'admin';
  const canEdit = isAdmin || user!.role === 'pathologist';

  const { data: tests = [], isLoading } = useTests(isAdmin);
  const { data: categories = [] } = useTestCategories();
  const save = useSaveTest();
  const remove = useDeleteTest();
  const createCategory = useCreateTestCategory();
  const bulkInsert = useBulkInsertTests();

  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [deleting, setDeleting] = useState<LabTest | null>(null);

  // Inline "create category" inside the test dialog
  const [inlineCategory, setInlineCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  // Page-level "New Category" dialog
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [headerCategoryName, setHeaderCategoryName] = useState('');
  const [categoryError, setCategoryError] = useState('');

  // CSV bulk import
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importFileName, setImportFileName] = useState('');
  const [importRows, setImportRows] = useState<NewLabTest[]>([]);
  const [importErrors, setImportErrors] = useState<string[]>([]);

  const activeCount = tests.filter((t) => t.is_active).length;

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return tests;
    return tests.filter(
      (t) =>
        t.code.toLowerCase().includes(q) ||
        t.name.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q)
    );
  }, [tests, search]);

  const openAdd = () => {
    setForm(EMPTY_FORM);
    setFormError('');
    setInlineCategory(false);
    setNewCategoryName('');
    setDialogOpen(true);
  };

  const exportHeaders = ['Code', 'Name', 'Category', 'Price (BDT)', 'Status'];
  const exportRows = filtered.map((t) => [
    t.code,
    t.name,
    t.category,
    t.price,
    t.is_active ? 'Active' : 'Inactive',
  ]);

  // ---- CSV bulk import ----
  const IMPORT_COLUMNS = ['code', 'name', 'category', 'price', 'is_active'];

  const downloadTemplate = () => {
    downloadCsv('test-import-template.csv', IMPORT_COLUMNS, [
      ['CBC', 'Complete Blood Count', 'Hematology', '400', 'active'],
      ['LFT', 'Liver Function Test', 'Biochemistry', '1200', 'active'],
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
    const iCode = col('code');
    const iName = col('name');
    const iCat = col('category');
    if (iCode === -1 || iName === -1 || iCat === -1) {
      setImportErrors([
        'Missing required columns. The header must include "code", "name" and "category". Download the template for the exact format.',
      ]);
      return;
    }
    const iPrice = col('price');
    const iActive = col('is_active');

    const existing = new Set(tests.map((t) => t.code));
    const seen = new Set<string>();
    const valid: NewLabTest[] = [];
    const errors: string[] = [];
    const cell = (r: string[], i: number) => (i >= 0 ? (r[i] ?? '').trim() : '');

    grid.slice(1).forEach((r, idx) => {
      const line = idx + 2;
      const code = cell(r, iCode).toUpperCase();
      const name = cell(r, iName);
      const category = cell(r, iCat);

      if (!code) return errors.push(`Row ${line}: test code is required.`);
      if (!/^[A-Z0-9-]{1,30}$/.test(code))
        return errors.push(`Row ${line}: code "${code}" must be alphanumeric (max 30 chars).`);
      if (!name) return errors.push(`Row ${line}: test name is required.`);
      if (!category) return errors.push(`Row ${line}: category is required.`);
      if (existing.has(code))
        return errors.push(`Row ${line}: code ${code} already exists in the system.`);
      if (seen.has(code)) return errors.push(`Row ${line}: code ${code} is duplicated in the file.`);

      let price = 0;
      const p = cell(r, iPrice);
      if (p) {
        const n = Number(p);
        if (isNaN(n) || n < 0)
          return errors.push(`Row ${line}: price "${p}" must be a non-negative number.`);
        price = n;
      }

      // Blank / true / active / yes / 1 → active; anything else (inactive/false/no/0) → inactive
      const is_active = ['', 'true', 'active', 'yes', '1'].includes(cell(r, iActive).toLowerCase());

      seen.add(code);
      valid.push({ code, name, category, price, is_active });
    });

    setImportRows(valid);
    setImportErrors(errors);
  };

  const runImport = () => {
    if (importRows.length === 0) return;
    bulkInsert.mutate(importRows, {
      onSuccess: () => {
        // Detailed toast is shown by the mutation's onSuccess handler in useBulkInsertTests
        setImportOpen(false);
        setImportRows([]);
        setImportErrors([]);
      },
    });
  };

  const openEdit = (t: LabTest) => {
    setForm({
      id: t.id,
      code: t.code,
      name: t.name,
      category: t.category,
      price: String(t.price),
      is_active: t.is_active,
    });
    setFormError('');
    setInlineCategory(false);
    setNewCategoryName('');
    setDialogOpen(true);
  };

  // Create a category from inside the test dialog and select it for the test.
  const handleInlineCreateCategory = () => {
    createCategory.mutate(newCategoryName, {
      onSuccess: (name) => {
        setForm((f) => ({ ...f, category: name }));
        setInlineCategory(false);
        setNewCategoryName('');
        toast.success(`Category "${name}" created`);
      },
    });
  };

  // Create a category from the page-level dialog.
  const handleHeaderCreateCategory = (e: FormEvent) => {
    e.preventDefault();
    setCategoryError('');
    if (!headerCategoryName.trim()) {
      setCategoryError('Category name is required.');
      return;
    }
    if (categories.some((c) => c.name.toLowerCase() === headerCategoryName.trim().toLowerCase())) {
      setCategoryError('That category already exists.');
      return;
    }
    createCategory.mutate(headerCategoryName, {
      onSuccess: (name) => {
        toast.success(`Category "${name}" created`);
        setHeaderCategoryName('');
        setCategoryDialogOpen(false);
      },
    });
  };

  const openCategoryDialog = () => {
    setHeaderCategoryName('');
    setCategoryError('');
    setCategoryDialogOpen(true);
  };

  const handleSave = (e: FormEvent) => {
    e.preventDefault();
    const code = form.code.trim().toUpperCase();
    const price = Number(form.price);
    if (!code) return setFormError('Test code is required.');
    if (!form.name.trim()) return setFormError('Test name is required.');
    if (!form.category.trim()) return setFormError('Category is required.');
    if (isNaN(price) || price < 0) return setFormError('Price must be a non-negative number.');
    const duplicate = tests.find((x) => x.code === code && x.id !== form.id);
    if (duplicate) return setFormError(`Test code ${code} already exists.`);

    save.mutate(
      {
        id: form.id,
        code,
        name: form.name.trim(),
        category: form.category.trim(),
        price,
        is_active: form.is_active,
      },
      {
        onSuccess: () => {
          toast.success('Test saved successfully');
          setDialogOpen(false);
        },
      }
    );
  };

  return (
    <div>
      <PageHeader
        title="Test Library"
        subtitle={`${activeCount} pathology tests available`}
        actions={
          <>
            <ExportMenu
              filename={`tests-${new Date().toISOString().slice(0, 10)}`}
              sheetName="Tests"
              headers={exportHeaders}
              rows={exportRows}
              disabled={filtered.length === 0}
            />
            {canEdit && (
              <>
                <Button variant="outline" onClick={openImport}>
                  <Upload className="h-4 w-4" /> Import CSV
                </Button>
                <Button variant="outline" onClick={openCategoryDialog}>
                  <FolderPlus className="h-4 w-4" /> New Category
                </Button>
                <Button onClick={openAdd}>
                  <Plus className="h-4 w-4" /> Add Test
                </Button>
              </>
            )}
          </>
        }
      />

      <div className="relative mb-4 w-full max-w-xs">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search code, name, category..."
          className="pl-8"
        />
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      )}

      {!isLoading && filtered.length === 0 && (
        <Card>
          <EmptyState icon={FlaskConical} title="No tests found" />
        </Card>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map((t) => (
          <Card
            key={t.id}
            className={cn(
              'transition-all hover:border-slate-300 hover:shadow-md',
              !t.is_active && 'opacity-60'
            )}
          >
            <CardContent className="p-4">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className="bg-blue-100 font-mono text-blue-800 border-blue-200"
                  >
                    {t.code}
                  </Badge>
                  {!t.is_active && (
                    <Badge variant="outline" className="bg-slate-100 text-slate-500">
                      Inactive
                    </Badge>
                  )}
                </div>
                {canEdit && (
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => openEdit(t)}
                      aria-label={`Edit ${t.name}`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    {isAdmin && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setDeleting(t)}
                        aria-label={`Delete ${t.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-red-500" />
                      </Button>
                    )}
                  </div>
                )}
              </div>
              <p className="text-sm font-bold text-slate-900">{t.name}</p>
              <p className="text-xs text-slate-500">{t.category}</p>
              <p className="mt-2 text-xl font-bold text-slate-900">{formatCurrency(t.price)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Add / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? 'Edit Test' : 'Add Test'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="test-code">Test Code *</Label>
                <Input
                  id="test-code"
                  value={form.code}
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                  placeholder="CBC"
                  className="font-mono uppercase"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="test-price">Price (৳) *</Label>
                <Input
                  id="test-price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.price}
                  onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                  placeholder="500"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="test-name">Test Name *</Label>
              <Input
                id="test-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Complete Blood Count"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Category *</Label>
              {inlineCategory ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder="New category name"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleInlineCreateCategory();
                      }
                    }}
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleInlineCreateCategory}
                    disabled={createCategory.isPending || !newCategoryName.trim()}
                  >
                    {createCategory.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      'Add'
                    )}
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => setInlineCategory(false)}
                    aria-label="Cancel new category"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Select
                    value={form.category}
                    onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={c.name}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setNewCategoryName('');
                      setInlineCategory(true);
                    }}
                  >
                    <Plus className="h-4 w-4" /> New
                  </Button>
                </div>
              )}
            </div>
            {isAdmin && (
              <div className="flex items-center gap-3">
                <Switch
                  id="test-active"
                  checked={form.is_active}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
                />
                <Label htmlFor="test-active">Active</Label>
              </div>
            )}
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

      {/* Page-level New Category dialog */}
      <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Test Category</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleHeaderCreateCategory} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="header-category">Category Name *</Label>
              <Input
                id="header-category"
                value={headerCategoryName}
                onChange={(e) => setHeaderCategoryName(e.target.value)}
                placeholder="e.g. Immunology"
                autoFocus
              />
              {categories.length > 0 && (
                <p className="text-xs text-slate-500">
                  Existing: {categories.map((c) => c.name).join(', ')}
                </p>
              )}
            </div>
            {categoryError && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {categoryError}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCategoryDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createCategory.isPending}>
                {createCategory.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Create Category
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* CSV bulk import dialog */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Import Tests from CSV</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
              <p>
                Upload a <span className="font-medium">.csv</span> file with a header row. Required
                columns: <span className="font-mono font-semibold">code</span>,{' '}
                <span className="font-mono font-semibold">name</span>,{' '}
                <span className="font-mono font-semibold">category</span>. Optional:{' '}
                <span className="font-mono">price, is_active</span>. New categories are created
                automatically.
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
                          <TableHead className="hidden sm:table-cell">Category</TableHead>
                          <TableHead className="text-right">Price</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {importRows.slice(0, 50).map((t) => (
                          <TableRow key={t.code}>
                            <TableCell className="font-mono text-xs font-bold">{t.code}</TableCell>
                            <TableCell className="text-sm">{t.name}</TableCell>
                            <TableCell className="hidden text-sm text-slate-500 sm:table-cell">
                              {t.category}
                            </TableCell>
                            <TableCell className="text-right text-sm">
                              {formatCurrency(t.price)}
                            </TableCell>
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
              Import {importRows.length || ''} Test{importRows.length === 1 ? '' : 's'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete ${deleting?.name ?? ''}?`}
        description="The test will be deactivated and hidden from new requests (soft delete)."
        confirmLabel="Deactivate"
        loading={remove.isPending}
        onConfirm={() =>
          deleting &&
          remove.mutate(deleting.id, {
            onSuccess: () => {
              toast.success('Test deactivated');
              setDeleting(null);
            },
          })
        }
      />
    </div>
  );
}
