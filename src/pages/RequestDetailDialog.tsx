import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronUp, FileDown, FileText, FlaskConical, Info, Loader2, Pill, Plus, Stethoscope, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { SearchableSelect } from '@/components/shared/SearchableSelect';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { useAuth } from '@/context/AuthContext';
import { useTests } from '@/hooks/useTests';
import { useQuotaLimit } from '@/hooks/useSettings';
import {
  useAddRequestTest,
  useCollectSamples,
  useEmployeeUsage,
  useEmployeeYearRequests,
  useRemoveRequestTest,
  useRequestAction,
  useRequestDetail,
} from '@/hooks/useRequests';
import { supabase } from '@/lib/supabase';
import { calcAge, cn, formatCurrency, formatDate, formatDateTime, titleCase } from '@/lib/utils';
import type { RequestSummary, TestApproval } from '@/types';

import { RequisitionSlip, downloadSlipPdf } from '@/components/shared/RequisitionSlip';
import { PrescriptionSlip, downloadPrescriptionPdf } from '@/components/shared/PrescriptionSlip';
import {
  useMedicines,
  useSaveRequestMedicines,
  type NewRequestMedicine,
} from '@/hooks/useMedicines';

const APPROVAL_STYLES: Record<TestApproval, string> = {
  pending: 'bg-slate-100 text-slate-600 border-slate-200',
  approved: 'bg-blue-100 text-blue-800 border-blue-200',
  rejected: 'bg-red-100 text-red-800 border-red-200',
  completed: 'bg-emerald-100 text-emerald-800 border-emerald-200',
};

const STEPS = ['Created', 'Doctor', 'HR', 'Medical', 'Pathology', 'Done'];

const TIMING_FIELDS = [
  { key: 't_morning', label: 'Morning' },
  { key: 't_afternoon', label: 'Afternoon' },
  { key: 't_evening', label: 'Evening' },
  { key: 't_night', label: 'Night' },
] as const;

export const timingLabel = (m: {
  t_morning: boolean;
  t_afternoon: boolean;
  t_evening: boolean;
  t_night: boolean;
}) =>
  [
    m.t_morning && 'Morning',
    m.t_afternoon && 'Afternoon',
    m.t_evening && 'Evening',
    m.t_night && 'Night',
  ]
    .filter(Boolean)
    .join(' · ');

function deriveStep(status: RequestSummary['status']): { index: number; rejected: boolean } {
  switch (status) {
    case 'PENDING_DOCTOR':
      return { index: 1, rejected: false };
    case 'DOCTOR_REJECTED':
      return { index: 1, rejected: true };
    case 'PENDING_HR':
    case 'PENDING_HR_PARTIAL':
    case 'HR_RESTRICTED':
    case 'PENDING_ADMIN':
      return { index: 2, rejected: false };
    case 'ADMIN_REJECTED':
      return { index: 2, rejected: true };
    case 'PENDING_MEDICAL':
      return { index: 3, rejected: false };
    case 'MEDICAL_REJECTED':
      return { index: 3, rejected: true };
    case 'PENDING_PATHOLOGY':
    case 'SAMPLE_COLLECTED':
    case 'PATH_PARTIAL':
      return { index: 4, rejected: false };
    case 'COMPLETED':
      return { index: 5, rejected: false };
    default:
      return { index: 0, rejected: false };
  }
}

interface RequestDetailDialogProps {
  request: RequestSummary | null;
  onClose: () => void;
}

export function RequestDetailDialog({ request, onClose }: RequestDetailDialogProps) {
  const { user } = useAuth();
  const { data: detail, isLoading } = useRequestDetail(request?.id);
  const action = useRequestAction();
  const collectSamples = useCollectSamples();
  const { data: quotaLimit = 5 } = useQuotaLimit();
  const addTest = useAddRequestTest();
  const removeTest = useRemoveRequestTest();

  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [note, setNote] = useState('');
  const [showTimeline, setShowTimeline] = useState(false);
  const [showQuota, setShowQuota] = useState(false);
  const [slipBusy, setSlipBusy] = useState(false);
  const [rxBusy, setRxBusy] = useState(false);
  const [prescription, setPrescription] = useState('');
  const [rxMeds, setRxMeds] = useState<NewRequestMedicine[]>([]);
  const [addingTest, setAddingTest] = useState(false);

  const role = user?.role;
  const status = request?.status;

  const canDoctorAct = !!request && status === 'PENDING_DOCTOR' && (role === 'doctor' || role === 'admin');
  const canHrAct =
    !!request &&
    (status === 'PENDING_HR' || status === 'PENDING_HR_PARTIAL') &&
    (role === 'hr' || role === 'admin');
  const canAdminAct =
    !!request && (status === 'HR_RESTRICTED' || status === 'PENDING_ADMIN') && role === 'admin';
  const canMedicalAct =
    !!request && status === 'PENDING_MEDICAL' && (role === 'medical' || role === 'admin');
  // Pathology flow: PENDING_PATHOLOGY → (Sample Collection) → SAMPLE_COLLECTED → (Report Delivered) → COMPLETED
  const canCollectSample =
    !!request && status === 'PENDING_PATHOLOGY' && (role === 'pathologist' || role === 'admin');
  const canPathAct =
    !!request &&
    (status === 'SAMPLE_COLLECTED' || status === 'PATH_PARTIAL') &&
    (role === 'pathologist' || role === 'admin');
  const canPrint =
    !!request &&
    (status === 'COMPLETED' || canPathAct || canCollectSample) &&
    (role === 'admin' || role === 'pathologist');
  const showCheckboxes = canDoctorAct || canPathAct || canCollectSample;

  // Task 3: patient complaint + doctor prescription are hidden from the pathology view.
  const hideClinicalInfo = role === 'pathologist';
  // Task 4: the patient side (requester or the employee it belongs to) can download
  // the doctor's advice/prescription at any time once the doctor has reviewed.
  const canDownloadRx =
    !!request &&
    !!user &&
    (request.requester_id === user.id ||
      (!!user.emp_code && request.employee_code === user.emp_code) ||
      role === 'admin') &&
    !!(request.doctor_prescription || request.doctor_name);

  const tests = detail?.tests ?? [];
  const timeline = detail?.timeline ?? [];
  const rxMedsSaved = detail?.medicines ?? [];

  // Medicine library for the doctor's prescription picker
  const { data: medicineLib = [] } = useMedicines();
  const saveRequestMeds = useSaveRequestMedicines();

  // Prefill the doctor's medicine editor once per request from saved rows
  const [medsLoadedFor, setMedsLoadedFor] = useState<string | null>(null);
  useEffect(() => {
    if (!request || !detail) return;
    if (medsLoadedFor === request.id) return;
    setRxMeds(
      (detail.medicines ?? []).map(
        ({ id: _i, request_id: _r, created_at: _c, ...rest }) => rest
      )
    );
    setMedsLoadedFor(request.id);
  }, [request, detail, medsLoadedFor]);

  // Doctor-only: edit the test set before approving. Remove is the primary control;
  // adding is an explicit provision for when an extra test is required.
  const canEditTests = canDoctorAct;
  const { data: allTests = [] } = useTests();
  const availableTests = useMemo(
    () => allTests.filter((t) => !tests.some((rt) => rt.test_id === t.id)),
    [allTests, tests]
  );

  const { data: usage = 0 } = useEmployeeUsage(canHrAct ? request?.employee_id : null);
  const { data: yearRequests = [] } = useEmployeeYearRequests(
    canHrAct ? request?.employee_id : null,
    showQuota
  );

  // Reset per-request state and pre-check default selections
  useEffect(() => {
    if (!request) return;
    setNote('');
    setPrescription(request.doctor_prescription ?? '');
    setRxMeds([]);
    setMedsLoadedFor(null);
    setShowTimeline(false);
    setShowQuota(false);
    setSlipBusy(false);
    setRxBusy(false);
    setAddingTest(false);
  }, [request?.id]);

  useEffect(() => {
    if (tests.length === 0) {
      setChecked({});
      return;
    }
    const next: Record<string, boolean> = {};
    for (const t of tests) {
      if (canDoctorAct) next[t.id] = true;
      else if (canCollectSample) next[t.id] = t.approval === 'approved' && !t.collected_at;
      else if (canPathAct) next[t.id] = t.approval === 'approved';
      else next[t.id] = false;
    }
    setChecked(next);
  }, [request?.id, tests.length, canDoctorAct, canPathAct, canCollectSample]);

  const checkedRows = useMemo(() => tests.filter((t) => checked[t.id]), [tests, checked]);
  const selectedTotal = checkedRows.reduce((sum, t) => sum + Number(t.test?.price ?? 0), 0);

  if (!request) return null;

  const { index: stepIndex, rejected } = deriveStep(request.status);
  const now = () => new Date().toISOString();

  const finish = (message: string) => {
    toast.success(message);
    onClose();
  };

  const handleDoctorApprove = async () => {
    if (checkedRows.length === 0) {
      toast.error('Select at least one test to approve');
      return;
    }
    // Persist prescribed medicines first; abort on failure (hook shows the error)
    try {
      await saveRequestMeds.mutateAsync({ requestId: request.id, rows: rxMeds });
    } catch {
      return;
    }
    const allChecked = checkedRows.length === tests.length;
    action.mutate(
      {
        request,
        stage: allChecked ? 'DOCTOR_APPROVED' : 'DOCTOR_PARTIAL_APPROVED',
        updates: {
          status: allChecked ? 'PENDING_HR' : 'PENDING_HR_PARTIAL',
          doctor_name: user!.name,
          doctor_at: now(),
          doctor_prescription: prescription.trim() || null,
        },
        testUpdates: tests.map((t) => ({
          id: t.id,
          approval: checked[t.id] ? 'approved' : 'rejected',
        })),
        note,
      },
      { onSuccess: () => finish(`Doctor approval recorded for ${request.req_no}`) }
    );
  };

  const handleDoctorReject = async () => {
    try {
      await saveRequestMeds.mutateAsync({ requestId: request.id, rows: rxMeds });
    } catch {
      return;
    }
    action.mutate(
      {
        request,
        stage: 'DOCTOR_REJECTED',
        updates: {
          status: 'DOCTOR_REJECTED',
          doctor_name: user!.name,
          doctor_at: now(),
          doctor_prescription: prescription.trim() || null,
        },
        testUpdates: tests.map((t) => ({ id: t.id, approval: 'rejected' })),
        note,
      },
      { onSuccess: () => finish(`Doctor rejection recorded for ${request.req_no}`) }
    );
  };

  const handleHrApprove = async () => {
    const { data: exceeded, error } = await supabase.rpc('fn_quota_exceeded', {
      p_employee_id: request.employee_id,
    });
    if (error) {
      toast.error(`Quota check failed — ${error.message}`);
      return;
    }
    action.mutate(
      {
        request,
        stage: exceeded ? 'HR_RESTRICTED' : 'HR_APPROVED',
        updates: {
          status: exceeded ? 'HR_RESTRICTED' : 'PENDING_MEDICAL',
          hr_name: user!.name,
          hr_at: now(),
        },
        note,
      },
      {
        onSuccess: () => {
          if (exceeded) {
            toast.warning('Annual quota reached — request escalated to Admin');
            onClose();
          } else {
            finish(`HR approval recorded for ${request.req_no}`);
          }
        },
      }
    );
  };

  const handleAdmin = (approve: boolean) => {
    action.mutate(
      {
        request,
        stage: approve ? 'ADMIN_APPROVED' : 'ADMIN_REJECTED',
        updates: {
          status: approve ? 'PENDING_PATHOLOGY' : 'ADMIN_REJECTED',
          admin_name: user!.name,
          admin_at: now(),
        },
        note,
      },
      {
        onSuccess: () =>
          finish(`Admin ${approve ? 'override approval' : 'rejection'} recorded for ${request.req_no}`),
      }
    );
  };

  const handleMedicalApprove = () => {
    action.mutate(
      {
        request,
        stage: 'MEDICAL_APPROVED',
        updates: {
          status: 'PENDING_PATHOLOGY',
          medical_name: user!.name,
          medical_at: now(),
        },
        note,
      },
      { onSuccess: () => finish(`Medical Services approval recorded for ${request.req_no}`) }
    );
  };

  const handleMedicalReject = () => {
    action.mutate(
      {
        request,
        stage: 'MEDICAL_REJECTED',
        updates: {
          status: 'MEDICAL_REJECTED',
          medical_name: user!.name,
          medical_at: now(),
        },
        note,
      },
      { onSuccess: () => finish(`Medical Services rejection recorded for ${request.req_no}`) }
    );
  };

  // Per-test sample collection: each pathologist ticks the samples THEY collected.
  // Each test records collected_by + collected_at; the request advances to
  // SAMPLE_COLLECTED only once every approved test has been collected.
  const collectibleRows = tests.filter((t) => t.approval === 'approved' && !t.collected_at);
  const collectedCount = tests.filter((t) => t.approval === 'approved' && !!t.collected_at).length;
  const approvedCount = tests.filter((t) => t.approval === 'approved').length;

  const handleCollectSamples = () => {
    const collecting = collectibleRows.filter((t) => checked[t.id]);
    if (collecting.length === 0) {
      toast.error('Select at least one uncollected sample');
      return;
    }
    collectSamples.mutate(
      {
        request,
        testIds: collecting.map((t) => t.id),
        testCodes: collecting.map((t) => t.test?.code ?? '?'),
        remainingBefore: collectibleRows.length,
        note,
      },
      {
        onSuccess: (res) =>
          finish(
            res.allCollected
              ? `All samples collected for ${request.req_no} — ready for report delivery`
              : `${collecting.length} sample(s) collected for ${request.req_no} (${collectedCount + collecting.length}/${approvedCount} done)`
          ),
      }
    );
  };

  // "Report Delivered": completes the request. Once every approved test is delivered the
  // status becomes COMPLETED, which counts against the employee's annual quota (balance -1).
  const handleReportDelivered = () => {
    const approvedRows = tests.filter((t) => t.approval === 'approved');
    const completing = approvedRows.filter((t) => checked[t.id]);
    if (completing.length === 0) {
      toast.error('Select at least one test to deliver');
      return;
    }
    const allDone = completing.length === approvedRows.length;
    action.mutate(
      {
        request,
        stage: allDone ? 'COMPLETED' : 'PATH_PARTIAL',
        updates: {
          status: allDone ? 'COMPLETED' : 'PATH_PARTIAL',
          pathologist_name: user!.name,
          pathologist_at: now(),
        },
        testUpdates: completing.map((t) => ({ id: t.id, approval: 'completed' })),
        note,
      },
      {
        onSuccess: () =>
          finish(
            allDone
              ? `Report delivered — request ${request.req_no} completed and quota deducted`
              : `Partial delivery recorded for ${request.req_no}`
          ),
      }
    );
  };

  // Direct PDF download of the requisition slip (no preview modal).
  const handleDownloadSlip = async () => {
    setSlipBusy(true);
    try {
      const slipName = `PathLab-Slip-${request.slip_no ?? request.req_no}`;
      await downloadSlipPdf(slipName);
      toast.success(`Slip downloaded: ${slipName}.pdf`);
    } catch (e) {
      toast.error(`Could not download slip — ${(e as Error).message}`);
    } finally {
      setSlipBusy(false);
    }
  };

  // Task 4: patient-side PDF download of the doctor's advice/prescription.
  const handleDownloadPrescription = async () => {
    setRxBusy(true);
    try {
      const fileName = `Prescription-${request.req_no}`;
      await downloadPrescriptionPdf(fileName);
      toast.success(`Prescription downloaded: ${fileName}.pdf`);
    } catch (e) {
      toast.error(`Could not download prescription — ${(e as Error).message}`);
    } finally {
      setRxBusy(false);
    }
  };

  const hasAction = canDoctorAct || canHrAct || canAdminAct || canMedicalAct || canPathAct || canCollectSample;
  const quotaColor =
    usage >= quotaLimit
      ? 'bg-red-500'
      : usage >= quotaLimit - 1
        ? 'bg-amber-500'
        : 'bg-emerald-500';

  return (
    <>
      <Dialog open={!!request} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-[900px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <span className="font-mono">{request.req_no}</span>
              <StatusBadge status={request.status} />
            </DialogTitle>
            <DialogDescription>
              Submitted {formatDate(request.created_at)} by {request.requester_name}
            </DialogDescription>
          </DialogHeader>

          {/* Section 1 — Progress stepper */}
          <div className="flex items-center px-2 py-2">
            {STEPS.map((label, i) => {
              const completed = i < stepIndex;
              const current = i === stepIndex && !rejected;
              const failedHere = rejected && i === stepIndex;
              return (
                <div key={label} className="flex flex-1 items-center last:flex-none">
                  <div className="flex flex-col items-center">
                    <div
                      className={cn(
                        'flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold',
                        completed && 'border-emerald-500 bg-emerald-500 text-white',
                        current && 'border-slate-900 bg-slate-900 text-white',
                        failedHere && 'border-red-500 bg-red-500 text-white',
                        !completed && !current && !failedHere && 'border-slate-200 bg-white text-slate-400'
                      )}
                    >
                      {completed ? <Check className="h-4 w-4" /> : i + 1}
                    </div>
                    <span className="mt-1 text-[10px] text-slate-500">{label}</span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div
                      className={cn(
                        'mx-1 mb-4 h-0.5 flex-1',
                        i < stepIndex ? 'bg-emerald-500' : 'bg-slate-200'
                      )}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {/* Section 2 — Request info grid */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Patient</p>
              <p className="font-semibold text-slate-900">{request.ben_name}</p>
              <p className="text-sm text-slate-500">
                {request.ben_relation}
                {request.ben_dob ? ` · ${calcAge(request.ben_dob)}` : ''}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Employee Sponsor
              </p>
              <p className="font-semibold text-slate-900">{request.employee_name}</p>
              <p className="font-mono text-sm text-slate-500">{request.employee_code}</p>
            </div>
            {request.assigned_doctor_name && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Assigned Doctor
                </p>
                <p className="font-semibold text-slate-900">{request.assigned_doctor_name}</p>
                <p className="text-sm text-slate-500">
                  {request.doctor_at ? 'Reviewed' : 'Awaiting review'}
                </p>
              </div>
            )}
          </div>

          {/* Section 3 — HR quota panel */}
          {canHrAct && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
                  <Info className="h-4 w-4" />
                  HR Check — Annual Usage: {usage}/{quotaLimit}
                </div>
                <Button variant="ghost" size="sm" onClick={() => setShowQuota((s) => !s)}>
                  {showQuota ? 'Hide' : 'Show'}
                  {showQuota ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </div>
              <Progress
                value={Math.min((usage / quotaLimit) * 100, 100)}
                className="mt-2 bg-amber-100"
                indicatorClassName={quotaColor}
              />
              {showQuota && (
                <div className="mt-3 max-h-44 overflow-y-auto rounded-md border border-amber-200 bg-white">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Req No</TableHead>
                        <TableHead>Patient</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {yearRequests.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={3} className="text-center text-sm text-slate-400">
                            No requests this year
                          </TableCell>
                        </TableRow>
                      )}
                      {yearRequests.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="font-mono text-xs font-semibold">{r.req_no}</TableCell>
                          <TableCell className="text-sm">{r.ben_name}</TableCell>
                          <TableCell>
                            <StatusBadge status={r.status} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}

          {/* Section 4 — Tests table */}
          <div className="rounded-lg border border-slate-200">
            <Table>
              <TableHeader>
                <TableRow>
                  {showCheckboxes && <TableHead className="w-10" aria-label="Select" />}
                  <TableHead>Code</TableHead>
                  <TableHead>Test Name</TableHead>
                  <TableHead className="hidden sm:table-cell">Category</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead>Status</TableHead>
                  {canEditTests && <TableHead className="w-10" aria-label="Remove" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading &&
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={(showCheckboxes ? 6 : 5) + (canEditTests ? 1 : 0)}>
                        <Skeleton className="h-5 w-full" />
                      </TableCell>
                    </TableRow>
                  ))}
                {!isLoading &&
                  tests.map((t) => {
                    const checkboxDisabled = canCollectSample
                      ? t.approval !== 'approved' || !!t.collected_at
                      : canPathAct
                        ? t.approval !== 'approved'
                        : false;
                    return (
                      <TableRow key={t.id}>
                        {showCheckboxes && (
                          <TableCell>
                            <Checkbox
                              checked={!!checked[t.id]}
                              disabled={checkboxDisabled}
                              onCheckedChange={(v) =>
                                setChecked((c) => ({ ...c, [t.id]: v === true }))
                              }
                              aria-label={`Select ${t.test?.name}`}
                              className={cn(checkboxDisabled && 'opacity-40')}
                            />
                          </TableCell>
                        )}
                        <TableCell className="font-mono text-xs font-bold">{t.test?.code}</TableCell>
                        <TableCell className="text-sm font-medium">{t.test?.name}</TableCell>
                        <TableCell className="hidden text-sm text-slate-500 sm:table-cell">
                          {t.test?.category}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {formatCurrency(t.test?.price ?? 0)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={APPROVAL_STYLES[t.approval]}>
                            {t.approval}
                          </Badge>
                          {t.collected_at && (
                            <p className="mt-1 text-[10px] leading-tight text-slate-500">
                              <Check className="mr-0.5 inline h-3 w-3 text-emerald-600" />
                              {t.collected_by_name} · {formatDateTime(t.collected_at)}
                            </p>
                          )}
                        </TableCell>
                        {canEditTests && (
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              disabled={removeTest.isPending || tests.length <= 1}
                              title={
                                tests.length <= 1
                                  ? 'A request must keep at least one test'
                                  : 'Remove this test'
                              }
                              aria-label={`Remove ${t.test?.name}`}
                              onClick={() => removeTest.mutate({ id: t.id, requestId: request.id })}
                            >
                              <Trash2 className="h-3.5 w-3.5 text-red-500" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                {!isLoading && tests.length > 0 && (
                  <TableRow className="bg-slate-50 font-semibold hover:bg-slate-50">
                    <TableCell
                      colSpan={showCheckboxes ? 4 : 3}
                      className="text-right text-sm"
                    >
                      {showCheckboxes ? 'Selected Total' : 'Total'}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {formatCurrency(
                        showCheckboxes
                          ? selectedTotal
                          : tests.reduce((s, t) => s + Number(t.test?.price ?? 0), 0)
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-slate-500">
                      {showCheckboxes ? `${checkedRows.length}/${tests.length}` : `${tests.length} test(s)`}
                    </TableCell>
                    {canEditTests && <TableCell />}
                  </TableRow>
                )}
              </TableBody>
            </Table>

            {canEditTests && (
              <div className="border-t border-slate-100 p-2">
                {addingTest ? (
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <SearchableSelect
                        options={availableTests.map((t) => ({
                          value: t.id,
                          label: t.name,
                          sub: `${t.code} · ${t.category} · ${formatCurrency(t.price)}`,
                        }))}
                        value={null}
                        onChange={(testId) =>
                          addTest.mutate(
                            { requestId: request.id, testId },
                            { onSuccess: () => setAddingTest(false) }
                          )
                        }
                        placeholder="Search a test to include..."
                        emptyText="All active tests are already on this request"
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setAddingTest(false)}
                      aria-label="Cancel adding test"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-slate-600"
                    onClick={() => setAddingTest(true)}
                    disabled={addTest.isPending || availableTests.length === 0}
                    title={
                      availableTests.length === 0 ? 'All active tests are already added' : undefined
                    }
                  >
                    {addTest.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                    Include another test
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Section 5 — Patient complaint + doctor prescription
              (hidden entirely from the pathology view) */}
          {!hideClinicalInfo && request.notes && (
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Patient Complaint
              </p>
              <p className="whitespace-pre-wrap text-sm text-slate-700">{request.notes}</p>
            </div>
          )}
          {!hideClinicalInfo && request.doctor_prescription && !canDoctorAct && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
              <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-blue-600">
                <Stethoscope className="h-3.5 w-3.5" /> Doctor&apos;s Recommendation / Advice
              </p>
              <p className="whitespace-pre-wrap text-sm text-slate-800">
                {request.doctor_prescription}
              </p>
              {request.doctor_name && (
                <p className="mt-1.5 text-xs text-slate-500">
                  — {request.doctor_name}
                  {request.doctor_at ? ` · ${formatDateTime(request.doctor_at)}` : ''}
                </p>
              )}
            </div>
          )}
          {!hideClinicalInfo && !canDoctorAct && rxMedsSaved.length > 0 && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-blue-600">
                <Pill className="h-3.5 w-3.5" /> Prescribed Medicines
              </p>
              <div className="space-y-1.5">
                {rxMedsSaved.map((m) => (
                  <div key={m.id} className="text-sm">
                    <span className="font-semibold text-slate-800">
                      {m.medicine_name}
                      {m.strength ? ` ${m.strength}` : ''}
                    </span>
                    {m.form && <span className="text-xs text-slate-500"> ({m.form})</span>}
                    <span className="ml-2 text-xs font-medium text-blue-700">
                      {timingLabel(m) || 'As directed'}
                    </span>
                    {m.instruction && (
                      <span className="ml-2 text-xs text-slate-500">· {m.instruction}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section 6 — Timeline */}
          <div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowTimeline((s) => !s)}
              className="px-2 text-slate-500"
            >
              {showTimeline ? 'Hide' : 'Show'} Timeline ({timeline.length} events)
              {showTimeline ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
            {showTimeline && (
              <div className="mt-2 space-y-3 border-l-2 border-slate-100 pl-4">
                {timeline.map((ev) => (
                  <div key={ev.id} className="relative">
                    <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-slate-400" />
                    <p className="text-sm font-medium text-slate-800">
                      {titleCase(ev.stage)}{' '}
                      <span className="font-normal text-slate-500">· {ev.actor_name}</span>
                    </p>
                    {ev.note && <p className="text-xs text-slate-500">{ev.note}</p>}
                    <p className="text-xs text-slate-400">{formatDateTime(ev.created_at)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section 7 — Action area */}
          {(hasAction || canPrint || canDownloadRx) && <Separator />}
          {canDoctorAct && (
            <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-3">
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-blue-700">
                <Stethoscope className="h-3.5 w-3.5" /> Doctor&apos;s Recommendation / Advice
              </p>
              <Textarea
                value={prescription}
                onChange={(e) => setPrescription(e.target.value)}
                placeholder="Write your recommendation or medical advice for the patient... (saved with your decision; visible to the patient, hidden from pathology)"
                rows={3}
                className="bg-white"
              />

              {/* Prescribed medicines builder */}
              <p className="mb-1.5 mt-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-blue-700">
                <Pill className="h-3.5 w-3.5" /> Prescribed Medicines
              </p>
              <div className="space-y-2">
                {rxMeds.map((m, i) => (
                  <div key={`${m.medicine_name}-${i}`} className="rounded-md border border-blue-200 bg-white p-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-800">
                        {m.medicine_name}
                        {m.strength && (
                          <span className="font-normal text-slate-500"> · {m.strength}</span>
                        )}
                        {m.form && <span className="font-normal text-slate-400"> · {m.form}</span>}
                      </p>
                      <button
                        type="button"
                        onClick={() => setRxMeds((r) => r.filter((_, x) => x !== i))}
                        className="text-slate-400 hover:text-red-500"
                        aria-label={`Remove ${m.medicine_name}`}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        When to take:
                      </span>
                      {TIMING_FIELDS.map(({ key, label }) => (
                        <label
                          key={key}
                          className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-600"
                        >
                          <Checkbox
                            checked={m[key]}
                            onCheckedChange={(v) =>
                              setRxMeds((r) =>
                                r.map((row, x) => (x === i ? { ...row, [key]: v === true } : row))
                              )
                            }
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                    <Input
                      className="mt-2 h-8 bg-white text-xs"
                      placeholder="Instruction (e.g. after meal, for 7 days)"
                      value={m.instruction ?? ''}
                      onChange={(e) =>
                        setRxMeds((r) =>
                          r.map((row, x) =>
                            x === i ? { ...row, instruction: e.target.value || null } : row
                          )
                        )
                      }
                    />
                  </div>
                ))}
                <SearchableSelect
                  options={medicineLib
                    .filter((md) => !rxMeds.some((r) => r.medicine_id === md.id))
                    .map((md) => ({
                      value: md.id,
                      label: [md.name, md.strength].filter(Boolean).join(' '),
                      sub: [md.generic_name, md.form].filter(Boolean).join(' · ') || undefined,
                    }))}
                  value={null}
                  onChange={(id) => {
                    const md = medicineLib.find((x) => x.id === id);
                    if (!md) return;
                    setRxMeds((r) => [
                      ...r,
                      {
                        medicine_id: md.id,
                        medicine_name: md.name,
                        strength: md.strength,
                        form: md.form,
                        t_morning: false,
                        t_afternoon: false,
                        t_evening: false,
                        t_night: false,
                        instruction: null,
                      },
                    ]);
                  }}
                  placeholder="Search medicine library to add..."
                  emptyText="No medicines in the library — ask admin to add some"
                />
              </div>
            </div>
          )}
          {hasAction && (
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add a note (optional)..."
              rows={2}
            />
          )}
          {(hasAction || canPrint || canDownloadRx) && (
            <div className="flex flex-wrap justify-end gap-2">
              {canDoctorAct && (
                <>
                  <Button variant="destructive" onClick={handleDoctorReject} disabled={action.isPending}>
                    {action.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                    Reject All
                  </Button>
                  <Button variant="success" onClick={handleDoctorApprove} disabled={action.isPending}>
                    {action.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                    Approve {checkedRows.length} Test{checkedRows.length === 1 ? '' : 's'}
                  </Button>
                </>
              )}
              {canHrAct && (
                <Button variant="success" onClick={handleHrApprove} disabled={action.isPending}>
                  {action.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Check Limit &amp; Approve
                </Button>
              )}
              {canAdminAct && (
                <>
                  <Button variant="destructive" onClick={() => handleAdmin(false)} disabled={action.isPending}>
                    {action.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                    Reject
                  </Button>
                  <Button variant="success" onClick={() => handleAdmin(true)} disabled={action.isPending}>
                    {action.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                    Override Approve
                  </Button>
                </>
              )}
              {canMedicalAct && (
                <>
                  <Button variant="destructive" onClick={handleMedicalReject} disabled={action.isPending}>
                    {action.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                    Reject
                  </Button>
                  <Button variant="success" onClick={handleMedicalApprove} disabled={action.isPending}>
                    {action.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                    Approve
                  </Button>
                </>
              )}
              {canCollectSample && (
                <>
                  {collectedCount > 0 && (
                    <span className="self-center text-xs font-medium text-slate-500">
                      Samples collected: {collectedCount}/{approvedCount}
                    </span>
                  )}
                  <Button
                    variant="success"
                    onClick={handleCollectSamples}
                    disabled={collectSamples.isPending || collectibleRows.length === 0}
                  >
                    {collectSamples.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <FlaskConical className="h-4 w-4" />
                    )}
                    Collect Samples ({collectibleRows.filter((t) => checked[t.id]).length})
                  </Button>
                </>
              )}
              {canPathAct && (
                <Button variant="success" onClick={handleReportDelivered} disabled={action.isPending}>
                  {action.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Report Delivered ({checkedRows.length})
                </Button>
              )}
              {canDownloadRx && (
                <Button variant="outline" onClick={handleDownloadPrescription} disabled={rxBusy}>
                  {rxBusy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FileText className="h-4 w-4" />
                  )}
                  {rxBusy ? 'Generating…' : 'Download Prescription'}
                </Button>
              )}
              {canPrint && (
                <Button variant="outline" onClick={handleDownloadSlip} disabled={slipBusy}>
                  {slipBusy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FileDown className="h-4 w-4" />
                  )}
                  {slipBusy ? 'Generating…' : 'Download Slip'}
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Off-screen documents — captured by html2canvas on demand */}
      {canPrint && <RequisitionSlip request={request} tests={tests} />}
      {canDownloadRx && (
        <PrescriptionSlip request={request} tests={tests} medicines={rxMedsSaved} />
      )}
    </>
  );
}
