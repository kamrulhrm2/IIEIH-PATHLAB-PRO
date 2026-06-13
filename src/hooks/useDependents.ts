import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { queryClient } from '@/lib/queryClient';
import type { Dependent } from '@/types';

export function useDependents(empCode?: string | null) {
  return useQuery({
    queryKey: ['dependents', empCode ?? 'all'],
    queryFn: async () => {
      let q = supabase.from('dependents').select('*').order('name');
      if (empCode) q = q.eq('emp_code', empCode);
      const { data, error } = await q;
      if (error) throw error;
      return data as Dependent[];
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
