import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { UserRole } from '@/types';

const ROLE_STYLES: Record<UserRole, string> = {
  admin: 'bg-rose-100 text-rose-800 border-rose-200',
  hr: 'bg-amber-100 text-amber-800 border-amber-200',
  doctor: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  pathologist: 'bg-violet-100 text-violet-800 border-violet-200',
  user: 'bg-blue-100 text-blue-800 border-blue-200',
};

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin',
  hr: 'HR',
  doctor: 'Doctor',
  pathologist: 'Pathologist',
  user: 'Employee',
};

export function RoleBadge({ role, className }: { role: UserRole; className?: string }) {
  return (
    <Badge variant="outline" className={cn(ROLE_STYLES[role], className)}>
      {ROLE_LABELS[role]}
    </Badge>
  );
}

export { ROLE_LABELS };
