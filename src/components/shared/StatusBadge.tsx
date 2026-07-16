import { Badge } from '@/components/ui/badge';
import { cn, titleCase } from '@/lib/utils';
import type { RequestStatus } from '@/types';

const STATUS_STYLES: Record<RequestStatus, string> = {
  PENDING_DOCTOR: 'bg-amber-100 text-amber-800 border-amber-200',
  PENDING_HR: 'bg-amber-100 text-amber-800 border-amber-200',
  PENDING_HR_PARTIAL: 'bg-amber-100 text-amber-800 border-amber-200',
  HR_RESTRICTED: 'bg-orange-100 text-orange-800 border-orange-200',
  PENDING_ADMIN: 'bg-orange-100 text-orange-800 border-orange-200',
  DOCTOR_REJECTED: 'bg-red-100 text-red-800 border-red-200',
  ADMIN_REJECTED: 'bg-red-100 text-red-800 border-red-200',
  PENDING_MEDICAL: 'bg-cyan-100 text-cyan-800 border-cyan-200',
  MEDICAL_REJECTED: 'bg-red-100 text-red-800 border-red-200',
  PENDING_PATHOLOGY: 'bg-violet-100 text-violet-800 border-violet-200',
  SAMPLE_COLLECTED: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  PATH_PARTIAL: 'bg-teal-100 text-teal-800 border-teal-200',
  COMPLETED: 'bg-emerald-100 text-emerald-800 border-emerald-200',
};

export function StatusBadge({ status, className }: { status: RequestStatus; className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn('whitespace-nowrap', STATUS_STYLES[status], className)}
      aria-label={`Status: ${titleCase(status)}`}
    >
      {titleCase(status)}
    </Badge>
  );
}
