import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { queryClient } from '@/lib/queryClient';
import type { Employee } from '@/types';

/**
 * Fetches ALL employees from Supabase using pagination.
 * Supabase default limit is 1000 rows per query - we paginate to get everything.
 * Supports up to 100,000+ employees reliably.
 */
const FETCH_PAGE_SIZE = 1000;

export function useEmployees() {
  return useQuery({
    queryKey: ['employees'],
    queryFn: async () => {
      const allEmployees: Employee[] = [];
      let from = 0;
      let hasMore = true;

      // Paginate through ALL employees
      while (hasMore) {
        const { data, error } = await supabase
          .from('employees')
          .select('*')
          .order('emp_code')
          .range(from, from + FETCH_PAGE_SIZE - 1);

        if (error) throw error;

        if (data && data.length > 0) {
          allEmployees.push(...(data as Employee[]));
          from += FETCH_PAGE_SIZE;
          // If we got less than full page, we're done
          hasMore = data.length === FETCH_PAGE_SIZE;
        } else {
          hasMore = false;
        }
      }

      console.log(`[useEmployees] Fetched ${allEmployees.length} total employees`);
      return allEmployees;
    },
    staleTime: 60_000,
  });
}

/**
 * Lightweight hook for getting just the total employee count.
 * More efficient than useEmployees() if you only need the count.
 */
export function useEmployeeCount() {
  return useQuery({
    queryKey: ['employee-count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('employees')
        .select('*', { count: 'exact', head: true });

      if (error) throw error;
      return count ?? 0;
    },
    staleTime: 30_000,
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
      queryClient.invalidateQueries({ queryKey: ['employee-count'] });
      queryClient.invalidateQueries({ queryKey: ['quota'] });
    },
    onError: (e: Error) => toast.error(`Failed to save employee — ${e.message}`),
  });
}

export type NewEmployee = Omit<Employee, 'id' | 'created_at' | 'updated_at'>;

/**
 * Bulk import employees from CSV with intelligent duplicate handling.
 * Supports UNLIMITED rows by chunking:
 *  - Existence check: 500 codes per query (avoids URL length limits)
 *  - UPSERT: 500 rows per batch (avoids timeout, payload size limits)
 *  - Total: Can handle 10,000+ employees reliably
 *
 * Behavior:
 *  - New employees (by emp_code): INSERTED
 *  - Existing employees (by emp_code): UPDATED with new CSV data
 */
const CHUNK_SIZE = 500;

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

export function useBulkInsertEmployees() {
  return useMutation({
    mutationFn: async (rows: NewEmployee[]) => {
      if (rows.length === 0) {
        return { total: 0, inserted: 0, updated: 0 };
      }

      console.log(`[BULK IMPORT] Starting import of ${rows.length} employees`);

      // Step 1: Check existing emp_codes in chunks (avoids URL/query limits)
      const empCodes = rows.map((r) => r.emp_code);
      const existingCodes = new Set<string>();

      const codeChunks = chunk(empCodes, CHUNK_SIZE);
      console.log(`[BULK IMPORT] Checking existence in ${codeChunks.length} chunks...`);

      for (let i = 0; i < codeChunks.length; i++) {
        const { data: existing, error: fetchError } = await supabase
          .from('employees')
          .select('emp_code')
          .in('emp_code', codeChunks[i]);

        if (fetchError) {
          throw new Error(
            `Failed to check existing employees (chunk ${i + 1}/${codeChunks.length}): ${fetchError.message}`
          );
        }

        (existing ?? []).forEach((e) => existingCodes.add(e.emp_code));
      }

      const insertCount = rows.filter((r) => !existingCodes.has(r.emp_code)).length;
      const updateCount = rows.filter((r) => existingCodes.has(r.emp_code)).length;

      console.log(
        `[BULK IMPORT] Pre-check complete: ${insertCount} new, ${updateCount} existing`
      );

      // Step 2: UPSERT in chunks to handle unlimited row counts
      const rowChunks = chunk(rows, CHUNK_SIZE);
      console.log(`[BULK IMPORT] Processing ${rowChunks.length} upsert chunks...`);

      let processedCount = 0;
      const errors: string[] = [];

      for (let i = 0; i < rowChunks.length; i++) {
        const batchNum = i + 1;
        try {
          const { error: upsertError } = await supabase
            .from('employees')
            .upsert(rowChunks[i], {
              onConflict: 'emp_code',
              ignoreDuplicates: false,
            });

          if (upsertError) {
            console.error(`[CHUNK ${batchNum}] Error:`, upsertError.message);
            errors.push(`Batch ${batchNum}: ${upsertError.message}`);
          } else {
            processedCount += rowChunks[i].length;
            console.log(
              `[CHUNK ${batchNum}/${rowChunks.length}] ✅ Processed ${rowChunks[i].length} rows (${processedCount}/${rows.length} total)`
            );
          }
        } catch (err) {
          const msg = (err as Error).message;
          console.error(`[CHUNK ${batchNum}] Exception:`, msg);
          errors.push(`Batch ${batchNum}: ${msg}`);
        }
      }

      // If all chunks failed, throw error
      if (processedCount === 0 && errors.length > 0) {
        throw new Error(`All batches failed: ${errors[0]}`);
      }

      // If some chunks failed, warn but continue
      if (errors.length > 0) {
        console.warn(
          `[BULK IMPORT] Partial success: ${processedCount}/${rows.length} processed. ${errors.length} batches failed.`
        );
      }

      return {
        total: rows.length,
        inserted: insertCount,
        updated: updateCount,
        processed: processedCount,
        failedBatches: errors.length,
      };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['employee-count'] });
      queryClient.invalidateQueries({ queryKey: ['quota'] });

      const failed = result.failedBatches ?? 0;
      if (failed > 0) {
        toast.warning(
          `⚠️ Partially imported: ${result.processed}/${result.total} records. ${failed} batch(es) failed - check console.`
        );
      } else if (result.inserted > 0 && result.updated > 0) {
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
      queryClient.invalidateQueries({ queryKey: ['employee-count'] });
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
      queryClient.invalidateQueries({ queryKey: ['employee-count'] });
      queryClient.invalidateQueries({ queryKey: ['dependents'] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['quota'] });
    },
    onError: (e: Error) => toast.error(`Failed to delete employee — ${e.message}`),
  });
}
