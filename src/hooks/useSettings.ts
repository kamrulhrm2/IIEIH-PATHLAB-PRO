import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { queryClient } from '@/lib/queryClient';

export const DEFAULT_QUOTA = 5;

/** The configurable annual request quota that applies to every employee. */
export function useQuotaLimit() {
  return useQuery({
    queryKey: ['quota-limit'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'annual_quota')
        .maybeSingle();
      if (error) throw error;
      const parsed = data ? parseInt(data.value, 10) : DEFAULT_QUOTA;
      return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_QUOTA;
    },
    staleTime: 60_000,
  });
}

export function useUpdateQuotaLimit() {
  return useMutation({
    mutationFn: async (limit: number) => {
      if (!Number.isInteger(limit) || limit < 1) {
        throw new Error('Quota must be a whole number of at least 1');
      }
      const { error } = await supabase
        .from('app_settings')
        .update({ value: String(limit), updated_at: new Date().toISOString() })
        .eq('key', 'annual_quota');
      if (error) throw error;
    },
    onSuccess: () => {
      // Anything that depends on the limit must re-fetch.
      queryClient.invalidateQueries({ queryKey: ['quota-limit'] });
      queryClient.invalidateQueries({ queryKey: ['quota'] });
      queryClient.invalidateQueries({ queryKey: ['usage'] });
    },
    onError: (e: Error) => toast.error(`Failed to update quota — ${e.message}`),
  });
}
