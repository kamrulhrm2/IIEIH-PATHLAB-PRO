import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { RelationType } from '@/types';

const RELATION_STYLES: Record<RelationType, string> = {
  Self: 'bg-slate-100 text-slate-700 border-slate-200',
  Spouse: 'bg-rose-100 text-rose-800 border-rose-200',
  Father: 'bg-blue-100 text-blue-800 border-blue-200',
  Mother: 'bg-violet-100 text-violet-800 border-violet-200',
  Son: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  Daughter: 'bg-amber-100 text-amber-800 border-amber-200',
};

export function RelationBadge({ relation, className }: { relation: RelationType; className?: string }) {
  return (
    <Badge variant="outline" className={cn(RELATION_STYLES[relation], className)}>
      {relation}
    </Badge>
  );
}
