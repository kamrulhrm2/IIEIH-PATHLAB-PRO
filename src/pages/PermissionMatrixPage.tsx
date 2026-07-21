import { Fragment, useMemo } from 'react';
import { Info, ShieldCheck } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
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
import { RoleBadge } from '@/components/shared/RoleBadge';
import { useRolePermissions, useSetRolePermission } from '@/hooks/usePermissions';
import { CONTROLLABLE_ROLES, FEATURES } from '@/lib/permissions';
import { cn } from '@/lib/utils';
import type { UserRole } from '@/types';

const DISPLAY_ROLES: UserRole[] = ['admin', ...CONTROLLABLE_ROLES];

export default function PermissionMatrixPage() {
  const { data: matrix, isLoading } = useRolePermissions();
  const setPermission = useSetRolePermission();

  const grouped = useMemo(() => {
    const map = new Map<string, typeof FEATURES>();
    for (const f of FEATURES) {
      const list = map.get(f.group) ?? [];
      list.push(f);
      map.set(f.group, list);
    }
    return [...map.entries()];
  }, []);

  return (
    <div>
      <PageHeader
        title="Permission Matrix"
        subtitle="Control which pages each role can access"
      />

      <div className="mb-4 flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="font-semibold">How this works</p>
          <ul className="mt-1 list-inside list-disc space-y-0.5">
            <li>Check a box to grant that role access to a page; uncheck to remove it.</li>
            <li>Changes apply immediately — no save button needed.</li>
            <li>
              <span className="font-semibold">Admin</span> always has full access and can&apos;t be
              restricted here — this prevents accidentally locking everyone out of the system.
            </li>
            <li>
              This controls <span className="font-semibold">navigation and page access</span> only —
              workflow actions (e.g. who can approve a request) are governed separately by each
              stage&apos;s business rules.
            </li>
          </ul>
        </div>
      </div>

      <Card className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="sticky left-0 z-10 min-w-[180px] bg-white">Page</TableHead>
              {DISPLAY_ROLES.map((role) => (
                <TableHead key={role} className="text-center">
                  <RoleBadge role={role} className="whitespace-nowrap" />
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={DISPLAY_ROLES.length + 1}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))}
            {!isLoading &&
              grouped.map(([group, features]) => (
                <Fragment key={group}>
                  <TableRow className="hover:bg-transparent">
                    <TableCell
                      colSpan={DISPLAY_ROLES.length + 1}
                      className="bg-slate-50 py-1.5 text-xs font-bold uppercase tracking-wide text-slate-500"
                    >
                      {group}
                    </TableCell>
                  </TableRow>
                  {features.map((f) => (
                    <TableRow key={f.key}>
                      <TableCell className="sticky left-0 z-10 bg-white text-sm font-medium text-slate-800">
                        {f.label}
                      </TableCell>
                      {DISPLAY_ROLES.map((role) => {
                        const isAdmin = role === 'admin';
                        const checked = isAdmin ? true : !!matrix?.[role]?.[f.key];
                        return (
                          <TableCell key={role} className="text-center">
                            <Checkbox
                              checked={checked}
                              disabled={isAdmin || setPermission.isPending}
                              onCheckedChange={(v) =>
                                setPermission.mutate({
                                  role,
                                  feature_key: f.key,
                                  allowed: v === true,
                                })
                              }
                              className={cn(isAdmin && 'opacity-60')}
                              aria-label={`${f.label} — ${role}`}
                            />
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </Fragment>
              ))}
          </TableBody>
        </Table>
      </Card>

      <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-400">
        <ShieldCheck className="h-3.5 w-3.5" />
        Admin column is locked to always-on for safety.
      </p>
    </div>
  );
}
