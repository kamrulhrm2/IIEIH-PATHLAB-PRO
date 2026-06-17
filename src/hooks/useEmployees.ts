import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { queryClient } from '@/lib/queryClient';
import type { Employee } from '@/types';

export function useEmployees() {
  return useQuery({
    queryKey: ['employees'],
    queryFn: async () => {
      const { data, error } = await supabase.from('employees').select('*').order('emp_code');
      if (error) throw error;
      return data as Employee[];
    },
    staleTime: 60_000,
  });
}

export function useSaveEmployee() {
  return useMutation({
    mutationFn: async (emp: Partial<Employee>) => {
      const { id, created_at, updated_at, ...fields } = emp;
      if (id) {
        const { error } = await supabase.from('employees').update(fields).eq('id', id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('employees').insert(fields);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['quota'] });
    },
    onError: (e: Error) => toast.error(`Failed to save employee — ${e.message}`),
  });
}

export type NewEmployee = Omit<Employee, 'id' | 'created_at' | 'updated_at'>;

/** Insert many employees at once (CSV bulk import). */
export function useBulkInsertEmployees() {
  return useMutation({
    mutationFn: async (rows: NewEmployee[]) => {
      const { error } = await supabase.from('employees').insert(rows);
      if (error) throw error;
      return rows.length;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['quota'] });
    },
    onError: (e: Error) => toast.error(`Bulk import failed — ${e.message}`),
  });
}

/** Set (or clear) the quota override for one or many employees. null = use global default. */
export function useSetEmployeesQuota() {
  return useMutation({
    mutationFn: async ({ ids, quota }: { ids: string[]; quota: number | null }) => {
      const { error } = await supabase
        .from('employees')
        .update({ quota_override: quota })
        .in('id', ids);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['quota'] });
      queryClient.invalidateQueries({ queryKey: ['usage'] });
    },
    onError: (e: Error) => toast.error(`Failed to update quota — ${e.message}`),
  });
}

export function useDeleteEmployee() {
  return useMutation({
    mutationFn: async ({ id, empCode }: { id: string; empCode: string }) => {
      // Removing the employee cascades their dependents + requests (FK ON DELETE CASCADE).
      const { error } = await supabase.from('employees').delete().eq('id', id);
      if (error) throw error;
      // The login account links to the employee only by emp_code (no FK), so remove it here.
      const { error: userError } = await supabase.from('users').delete().eq('emp_code', empCode);
      if (userError) throw userError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['dependents'] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (e: Error) => toast.error(`Failed to delete employee — ${e.message}`),
  });
}
