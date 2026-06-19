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

/**
 * Bulk import employees from CSV with intelligent duplicate handling.
 * - New employees: Inserted as new records
 * - Existing employees (by emp_code): Updated with new data (UPSERT)
 * - Returns counts of inserted vs updated for user feedback
 */
export function useBulkInsertEmployees() {
  return useMutation({
    mutationFn: async (rows: NewEmployee[]) => {
      if (rows.length === 0) {
        return { total: 0, inserted: 0, updated: 0, skipped: 0 };
      }

      // Step 1: Fetch all existing emp_codes to determine inserts vs updates
      const empCodes = rows.map((r) => r.emp_code);
      const { data: existing, error: fetchError } = await supabase
        .from('employees')
        .select('emp_code')
        .in('emp_code', empCodes);

      if (fetchError) {
        throw new Error(`Failed to check existing employees: ${fetchError.message}`);
      }

      const existingCodes = new Set((existing ?? []).map((e) => e.emp_code));
      const insertCount = rows.filter((r) => !existingCodes.has(r.emp_code)).length;
      const updateCount = rows.filter((r) => existingCodes.has(r.emp_code)).length;

      // Step 2: UPSERT - Insert new records, update existing ones by emp_code
      const { error: upsertError } = await supabase
        .from('employees')
        .upsert(rows, {
          onConflict: 'emp_code',
          ignoreDuplicates: false,
        });

      if (upsertError) {
        throw new Error(upsertError.message);
      }

      return {
        total: rows.length,
        inserted: insertCount,
        updated: updateCount,
        skipped: 0,
      };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['quota'] });

      // Provide detailed feedback to user
      if (result.inserted > 0 && result.updated > 0) {
        toast.success(
          `✅ Import complete: ${result.inserted} new + ${result.updated} updated = ${result.total} total`
        );
      } else if (result.inserted > 0) {
        toast.success(`✅ ${result.inserted} new employees imported successfully`);
      } else if (result.updated > 0) {
        toast.success(`✅ ${result.updated} existing employees updated successfully`);
      } else {
        toast.success(`✅ Import processed: ${result.total} records`);
      }
    },
    onError: (e: Error) => {
      console.error('[BULK IMPORT ERROR]', e);
      toast.error(`❌ Bulk import failed — ${e.message}`);
    },
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
