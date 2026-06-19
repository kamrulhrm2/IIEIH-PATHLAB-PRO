import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { queryClient } from '@/lib/queryClient';
import type { Dependent } from '@/types';

/**
 * Fetches dependents with pagination to bypass Supabase's 1000-row default limit.
 * If empCode is provided, filters to that employee's dependents.
 */
const DEPENDENTS_PAGE_SIZE = 1000;

export function useDependents(empCode?: string | null) {
  return useQuery({
    queryKey: ['dependents', empCode ?? 'all'],
    queryFn: async () => {
      const allDependents: Dependent[] = [];
      let from = 0;
      let hasMore = true;

      while (hasMore) {
        let q = supabase
          .from('dependents')
          .select('*')
          .order('name')
          .range(from, from + DEPENDENTS_PAGE_SIZE - 1);

        if (empCode) q = q.eq('emp_code', empCode);

        const { data, error } = await q;
        if (error) throw error;

        if (data && data.length > 0) {
          allDependents.push(...(data as Dependent[]));
          from += DEPENDENTS_PAGE_SIZE;
          hasMore = data.length === DEPENDENTS_PAGE_SIZE;
        } else {
          hasMore = false;
        }
      }

      return allDependents;
    },
    staleTime: 60_000,
  });
}

export function useSaveDependent() {
  return useMutation({
    mutationFn: async (dep: Partial<Dependent>) => {
      const { id, created_at, updated_at, ...fields } = dep;
      if (id) {
        const { error } = await supabase.from('dependents').update(fields).eq('id', id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('dependents').insert(fields);
        if (error) throw error;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dependents'] }),
    onError: (e: Error) => toast.error(`Failed to save dependent — ${e.message}`),
  });
}

export function useDeleteDependent() {
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('dependents').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dependents'] }),
    onError: (e: Error) => toast.error(`Failed to delete dependent — ${e.message}`),
  });
}
