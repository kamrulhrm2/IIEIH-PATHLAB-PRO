import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, Info, Loader2, Search, Stethoscope } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { PageHeader } from '@/components/layout/PageHeader';
import { EmployeeInfoCard } from '@/components/shared/EmployeeInfoCard';
import { RelationBadge } from '@/components/shared/RelationBadge';
import { SearchableSelect } from '@/components/shared/SearchableSelect';
import { useAuth } from '@/context/AuthContext';
import { useDependents } from '@/hooks/useDependents';
import { useEmployees } from '@/hooks/useEmployees';
import { useTests } from '@/hooks/useTests';
import { useDoctors } from '@/hooks/useUsers';
import { useEmployeeUsage, useSubmitRequest } from '@/hooks/useRequests';
import { useQuotaLimit } from '@/hooks/useSettings';
import { calcAge, cn, formatCurrency, formatDate } from '@/lib/utils';
import type { RelationType } from '@/types';

const STEPS = [
  'Select Employee',
  'Select Beneficiary',
  'Choose Tests',
  'Choose Doctor',
  'Review & Submit',
];

export default function NewRequestPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: employees = [] } = useEmployees();
  const { data: tests = [] } = useTests();
  const { data: doctors = [] } = useDoctors();
  const submit = useSubmitRequest();

  const [step, setStep] = useState(0);
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [beneficiary, setBeneficiary] = useState<string | null>(null); // 'self' | dependent id
  const [selectedTests, setSelectedTests] = useState<Set<string>>(new Set());
  const [testSearch, setTestSearch] = useState('');
  const [doctorId, setDoctorId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');

  const confirmedEmployees = useMemo(
    () => employees.filter((e) => e.status === 'confirmed'),
    [employees]
  );
  const isEmployeeRole = user!.role === 'user';
  const isAdmin = user!.role === 'admin';
  const ownEmployee = employees.find((e) => e.emp_code === user!.emp_code);

  // Non-admin users can only see themselves
  const visibleEmployees = useMemo(
    () => (isAdmin ? confirmedEmployees : (ownEmployee ? [ownEmployee] : [])),
    [isAdmin, confirmedEmployees, ownEmployee]
  );

  // Auto-select own record for non-admin users
  useEffect(() => {
    if (!isAdmin && ownEmployee && !employeeId) {
      setEmployeeId(ownEmployee.id);
    }
  }, [isAdmin, ownEmployee, employeeId]);

  const selectedEmployee = employees.find((e) => e.id === employeeId) ?? null;
  const { data: dependents = [] } = useDependents(selectedEmployee?.emp_code ?? null);

  // Quota gate: non-admin requesters can't proceed once the employee hits their limit.
  const { data: selectedUsage = 0 } = useEmployeeUsage(selectedEmployee?.id);
  const { data: defaultLimit = 5 } = useQuotaLimit();
  const effectiveLimit = selectedEmployee?.quota_override ?? defaultLimit;
  const quotaBlocked = !!selectedEmployee && !isAdmin && selectedUsage >= effectiveLimit;

  const selectedDependent =
    beneficiary && beneficiary !== 'self' ? dependents.find((d) => d.id === beneficiary) : null;
  const benName = beneficiary === 'self' ? selectedEmployee?.name ?? '' : selectedDependent?.name ?? '';
  const benRelation: RelationType =
    beneficiary === 'self' ? 'Self' : selectedDependent?.relation ?? 'Self';
  const benDob = beneficiary === 'self' ? null : selectedDependent?.dob ?? null;

  const filteredTests = useMemo(() => {
    const q = testSearch.toLowerCase().trim();
    if (!q) return tests;
    return tests.filter(
      (t) =>
        t.code.toLowerCase().includes(q) ||
        t.name.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q)
    );
  }, [tests, testSearch]);

  const chosenTests = tests.filter((t) => selectedTests.has(t.id));
  const total = chosenTests.reduce((sum, t) => sum + Number(t.price), 0);
  const selectedDoctor = doctors.find((d) => d.id === doctorId) ?? null;

  const canNext =
    step === 0
      ? !!selectedEmployee && !quotaBlocked
      : step === 1
        ? !!beneficiary
        : step === 2
          ? selectedTests.size > 0
          : step === 3
            ? !!doctorId
            : true;

  const handleSubmit = () => {
    if (!selectedEmployee || !beneficiary || selectedTests.size === 0 || !selectedDoctor) return;
    if (quotaBlocked) {
      toast.error('Annual limit reached — this request cannot be submitted for this employee.');
      return;
    }
    submit.mutate(
      {
        employee: selectedEmployee,
        benName,
        benRelation,
        benDob,
        dependentId: beneficiary === 'self' ? null : beneficiary,
        testIds: [...selectedTests],
        notes,
        assignedDoctorId: selectedDoctor.id,
        assignedDoctorName: selectedDoctor.name,
      },
      {
        onSuccess: (req) => {
          toast.success(`Request ${req.req_no} submitted successfully`);
          navigate('/requests/mine');
        },
      }
    );
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="New Request" subtitle="Submit a pathology test request" />

      {/* Step indicator */}
      <div className="mb-8 flex items-center">
        {STEPS.map((label, i) => {
          const completed = i < step;
          const current = i === step;
          return (
            <div key={label} className="flex flex-1 items-center last:flex-none">
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-full border-2 text-sm font-semibold transition-colors',
                    completed && 'border-emerald-500 bg-emerald-500 text-white',
                    current && 'border-slate-900 bg-slate-900 text-white',
                    !completed && !current && 'border-slate-200 bg-white text-slate-400'
                  )}
                >
                  {completed ? <Check className="h-4 w-4" /> : i + 1}
                </div>
                <span
                  className={cn(
                    'mt-1.5 hidden text-xs sm:block',
                    current ? 'font-semibold text-slate-900' : 'text-slate-500'
                  )}
                >
                  {label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={cn('mx-2 mb-5 h-0.5 flex-1', i < step ? 'bg-emerald-500' : 'bg-slate-200')}
                />
              )}
            </div>
          );
        })}
      </div>

      <Card>
        <CardContent className="space-y-5 p-6">
          {/* STEP 1 — Select employee */}
          {step === 0 && (
            <>
              <div className="space-y-1.5">
                <Label>Employee *</Label>
                {!isAdmin ? (
                  <Input
                    readOnly
                    value={
                      ownEmployee
                        ? `${ownEmployee.emp_code} — ${ownEmployee.name}`
                        : 'No employee record linked to your account'
                    }
                    className="bg-slate-50 font-mono"
                  />
                ) : (
                  <SearchableSelect
                    options={visibleEmployees.map((e) => ({
                      value: e.id,
                      label: `${e.emp_code} — ${e.name}`,
                      sub: [e.department, e.designation].filter(Boolean).join(' · '),
                    }))}
                    value={employeeId}
                    onChange={(v) => {
                      setEmployeeId(v);
                      setBeneficiary(null);
                    }}
                    placeholder="Search by Employee ID or name..."
                  />
                )}
              </div>
              {selectedEmployee && <EmployeeInfoCard employee={selectedEmployee} />}
            </>
          )}

          {/* STEP 2 — Select beneficiary */}
          {step === 1 && selectedEmployee && (
            <>
              <div className="space-y-1.5">
                <Label>Beneficiary *</Label>
                <SearchableSelect
                  options={[
                    { value: 'self', label: `Self — ${selectedEmployee.name}`, sub: 'Employee themself' },
                    ...dependents.map((d) => ({
                      value: d.id,
                      label: `${d.name} — ${d.relation}`,
                      sub: d.dob ? `DOB: ${formatDate(d.dob)}` : undefined,
                    })),
                  ]}
                  value={beneficiary}
                  onChange={setBeneficiary}
                  placeholder="Select beneficiary..."
                />
              </div>

              {dependents.length === 0 && (
                <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
                  <Info className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <p>
                      No dependents registered for this employee. Add family members in the
                      Dependents section first.
                    </p>
                    <Button asChild variant="link" className="h-auto p-0 text-blue-700">
                      <Link to="/dependents">→ Go to Dependents</Link>
                    </Button>
                  </div>
                </div>
              )}

              {beneficiary && (
                <Card className="bg-slate-50">
                  <CardContent className="flex items-center gap-3 p-4">
                    <RelationBadge relation={benRelation} />
                    <div>
                      <p className="font-semibold text-slate-900">{benName}</p>
                      <p className="text-sm text-slate-500">
                        {benRelation}
                        {benDob ? ` · Age: ${calcAge(benDob)}` : ''}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}

          {/* STEP 3 — Choose tests */}
          {step === 2 && (
            <>
              <div className="flex items-center justify-between">
                <Label>Select Tests *</Label>
                <Badge variant="secondary">
                  {selectedTests.size} selected · {formatCurrency(total)}
                </Badge>
              </div>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={testSearch}
                  onChange={(e) => setTestSearch(e.target.value)}
                  placeholder="Filter tests..."
                  className="pl-8"
                />
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {filteredTests.map((t) => {
                  const isSelected = selectedTests.has(t.id);
                  return (
                    <label
                      key={t.id}
                      className={cn(
                        'flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors',
                        isSelected
                          ? 'border-slate-900 bg-slate-50'
                          : 'border-slate-200 hover:border-slate-300'
                      )}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={(v) =>
                          setSelectedTests((prev) => {
                            const next = new Set(prev);
                            if (v === true) next.add(t.id);
                            else next.delete(t.id);
                            return next;
                          })
                        }
                        aria-label={t.name}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-900">{t.name}</p>
                        <p className="text-xs text-slate-500">
                          {t.code} · {t.category}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm font-semibold">{formatCurrency(t.price)}</span>
                    </label>
                  );
                })}
              </div>
            </>
          )}

          {/* STEP 4 — Choose doctor */}
          {step === 3 && (
            <>
              <div className="space-y-1.5">
                <Label>Assign Doctor *</Label>
                <SearchableSelect
                  options={doctors.map((d) => ({
                    value: d.id,
                    label: d.name,
                    sub: d.emp_code ? `Doctor · ${d.emp_code}` : 'Doctor',
                  }))}
                  value={doctorId}
                  onChange={setDoctorId}
                  placeholder="Search doctor by name..."
                  emptyText="No active doctors found"
                />
                <p className="text-xs text-slate-500">
                  The request will be sent to this doctor only. It moves to HR after they approve.
                </p>
              </div>

              {doctors.length === 0 && (
                <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  <Info className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    No active doctor accounts exist yet. An admin needs to create a user with the
                    Doctor role before requests can be routed for review.
                  </span>
                </div>
              )}

              {selectedDoctor && (
                <Card className="bg-slate-50">
                  <CardContent className="flex items-center gap-3 p-4">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                      <Stethoscope className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900">{selectedDoctor.name}</p>
                      <p className="text-sm text-slate-500">
                        Assigned reviewing doctor
                        {selectedDoctor.emp_code ? ` · ${selectedDoctor.emp_code}` : ''}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}

          {/* STEP 5 — Review & submit */}
          {step === 4 && selectedEmployee && (
            <>
              <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Employee</span>
                  <span className="font-semibold">
                    {selectedEmployee.name}{' '}
                    <span className="font-mono text-slate-500">({selectedEmployee.emp_code})</span>
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Beneficiary</span>
                  <span className="font-semibold">
                    {benName} — {benRelation}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Assigned Doctor</span>
                  <span className="font-semibold">{selectedDoctor?.name ?? '—'}</span>
                </div>
                <div className="border-t border-slate-200 pt-3">
                  <p className="mb-2 text-sm text-slate-500">Tests selected</p>
                  <ol className="space-y-1">
                    {chosenTests.map((t, i) => (
                      <li key={t.id} className="flex justify-between text-sm">
                        <span>
                          {i + 1}. {t.name}{' '}
                          <span className="font-mono text-xs text-slate-400">{t.code}</span>
                        </span>
                        <span>{formatCurrency(t.price)}</span>
                      </li>
                    ))}
                  </ol>
                  <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 text-sm font-bold">
                    <span>Total</span>
                    <span>{formatCurrency(total)}</span>
                  </div>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="notes">Clinical Notes (optional)</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Clinical notes, symptoms, doctor's advice..."
                  rows={3}
                />
              </div>
            </>
          )}

          {/* Navigation */}
          <div className="flex justify-between pt-2">
            <Button variant="outline" onClick={() => setStep((s) => s - 1)} disabled={step === 0}>
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
            {step < 4 ? (
              <Button onClick={() => setStep((s) => s + 1)} disabled={!canNext}>
                Next <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={handleSubmit} disabled={submit.isPending} variant="success">
                {submit.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Submit Request
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
