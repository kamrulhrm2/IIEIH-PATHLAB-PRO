import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { queryClient } from '@/lib/queryClient';
import type { Medicine, RequestMedicine } from '@/types';

const PAGE_SIZE = 1000;

/** Fetch ALL medicines with pagination (bypasses the 1000-row default cap). */
export function useMedicines(includeInactive = false) {
  return useQuery({
    queryKey: ['medicines', includeInactive],
    queryFn: async () => {
      const all: Medicine[] = [];
      let from = 0;
      let hasMore = true;
      while (hasMore) {
        let q = supabase
          .from('medicines')
          .select('*')
          .order('name')
          .range(from, from + PAGE_SIZE - 1);
        if (!includeInactive) q = q.eq('is_active', true);
        const { data, error } = await q;
        if (error) throw error;
        if (data && data.length > 0) {
          all.push(...(data as Medicine[]));
          from += PAGE_SIZE;
          hasMore = data.length === PAGE_SIZE;
        } else {
          hasMore = false;
        }
      }
      return all;
    },
    staleTime: 60_000,
  });
}

export function useSaveMedicine() {
  return useMutation({
    mutationFn: async (med: Partial<Medicine>) => {
      const { id, created_at, updated_at, ...fields } = med;
      if (id) {
        const { error } = await supabase
          .from('medicines')
          .update({ ...fields, updated_at: new Date().toISOString() })
          .eq('id', id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('medicines').insert(fields);
        if (error) throw error;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['medicines'] }),
    onError: (e: Error) => toast.error(`Failed to save medicine — ${e.message}`),
  });
}

export function useDeleteMedicine() {
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('medicines').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['medicines'] }),
    onError: (e: Error) => toast.error(`Failed to delete medicine — ${e.message}`),
  });
}

/** Row shape the doctor builds in the prescription UI (before save). */
export type NewRequestMedicine = Omit<RequestMedicine, 'id' | 'request_id' | 'created_at'>;

/**
 * Replace the prescribed-medicines set for a request (delete + insert).
 * Called when the doctor records their decision.
 */
export function useSaveRequestMedicines() {
  return useMutation({
    mutationFn: async ({ requestId, rows }: { requestId: string; rows: NewRequestMedicine[] }) => {
      const { error: delError } = await supabase
        .from('request_medicines')
        .delete()
        .eq('request_id', requestId);
      if (delError) throw delError;

      if (rows.length > 0) {
        const { error } = await supabase
          .from('request_medicines')
          .insert(rows.map((r) => ({ ...r, request_id: requestId })));
        if (error) throw error;
      }
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ['request-detail', vars.requestId] });
    },
    onError: (e: Error) => toast.error(`Failed to save prescribed medicines — ${e.message}`),
  });
}
