import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { queryClient } from '@/lib/queryClient';
import type { LabTest, TestCategory } from '@/types';

export function useTests(includeInactive = false) {
  return useQuery({
    queryKey: ['tests', includeInactive],
    queryFn: async () => {
      let q = supabase.from('tests').select('*').order('code');
      if (!includeInactive) q = q.eq('is_active', true);
      const { data, error } = await q;
      if (error) throw error;
      return data as LabTest[];
    },
    staleTime: 60_000,
  });
}

export function useSaveTest() {
  return useMutation({
    mutationFn: async (test: Partial<LabTest>) => {
      const { id, created_at, updated_at, ...fields } = test;
      if (id) {
        const { error } = await supabase.from('tests').update(fields).eq('id', id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('tests').insert(fields);
        if (error) throw error;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tests'] }),
    onError: (e: Error) => toast.error(`Failed to save test — ${e.message}`),
  });
}

export type NewLabTest = Omit<LabTest, 'id' | 'created_at' | 'updated_at'>;

/**
 * Bulk import tests from CSV with intelligent duplicate handling.
 * Supports UNLIMITED rows via chunking (500 per batch).
 * - Auto-creates missing categories
 * - UPSERT by code: New tests inserted, existing tests updated
 */
const TESTS_CHUNK_SIZE = 500;

function chunkTests<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

export function useBulkInsertTests() {
  return useMutation({
    mutationFn: async (rows: NewLabTest[]) => {
      if (rows.length === 0) {
        return { total: 0, inserted: 0, updated: 0, processed: 0, failedBatches: 0 };
      }

      console.log(`[TESTS BULK IMPORT] Starting import of ${rows.length} tests`);

      // Make sure every referenced category exists so it shows in dropdowns/filters.
      const categories = [...new Set(rows.map((r) => r.category).filter(Boolean))];
      if (categories.length > 0) {
        const { error: catError } = await supabase
          .from('test_categories')
          .upsert(categories.map((name) => ({ name })), {
            onConflict: 'name',
            ignoreDuplicates: true,
          });
        if (catError) throw catError;
      }

      // Check existing tests by code in chunks
      const testCodes = rows.map((r) => r.code);
      const existingCodes = new Set<string>();
      const codeChunks = chunkTests(testCodes, TESTS_CHUNK_SIZE);

      for (let i = 0; i < codeChunks.length; i++) {
        const { data: existing, error: fetchError } = await supabase
          .from('tests')
          .select('code')
          .in('code', codeChunks[i]);

        if (fetchError) {
          throw new Error(
            `Failed to check existing tests (chunk ${i + 1}/${codeChunks.length}): ${fetchError.message}`
          );
        }

        (existing ?? []).forEach((t) => existingCodes.add(t.code));
      }

      const insertCount = rows.filter((r) => !existingCodes.has(r.code)).length;
      const updateCount = rows.filter((r) => existingCodes.has(r.code)).length;

      // UPSERT in chunks for unlimited row support
      const rowChunks = chunkTests(rows, TESTS_CHUNK_SIZE);
      console.log(`[TESTS BULK IMPORT] Processing ${rowChunks.length} upsert chunks...`);

      let processedCount = 0;
      const errors: string[] = [];

      for (let i = 0; i < rowChunks.length; i++) {
        const batchNum = i + 1;
        try {
          const { error } = await supabase.from('tests').upsert(rowChunks[i], {
            onConflict: 'code',
            ignoreDuplicates: false,
          });

          if (error) {
            console.error(`[CHUNK ${batchNum}] Error:`, error.message);
            errors.push(`Batch ${batchNum}: ${error.message}`);
          } else {
            processedCount += rowChunks[i].length;
            console.log(
              `[CHUNK ${batchNum}/${rowChunks.length}] ✅ Processed ${rowChunks[i].length} rows`
            );
          }
        } catch (err) {
          const msg = (err as Error).message;
          errors.push(`Batch ${batchNum}: ${msg}`);
        }
      }

      if (processedCount === 0 && errors.length > 0) {
        throw new Error(`All batches failed: ${errors[0]}`);
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
      queryClient.invalidateQueries({ queryKey: ['tests'] });
      queryClient.invalidateQueries({ queryKey: ['test-categories'] });

      const failed = result.failedBatches ?? 0;
      if (failed > 0) {
        toast.warning(
          `⚠️ Partial import: ${result.processed}/${result.total} tests. ${failed} batch(es) failed.`
        );
        return;
      }

      if (result.inserted > 0 && result.updated > 0) {
        toast.success(
          `✅ Import complete: ${result.inserted} new + ${result.updated} updated = ${result.total} total`
        );
      } else if (result.inserted > 0) {
        toast.success(`✅ ${result.inserted} new tests imported successfully`);
      } else if (result.updated > 0) {
        toast.success(`✅ ${result.updated} existing tests updated successfully`);
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

export function useTestCategories() {
  return useQuery({
    queryKey: ['test-categories'],
    queryFn: async () => {
      const { data, error } = await supabase.from('test_categories').select('*').order('name');
      if (error) throw error;
      return data as TestCategory[];
    },
    staleTime: 60_000,
  });
}

export function useCreateTestCategory() {
  return useMutation({
    mutationFn: async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error('Category name is required');
      const { error } = await supabase.from('test_categories').insert({ name: trimmed });
      if (error) {
        if (error.code === '23505') throw new Error(`Category "${trimmed}" already exists`);
        throw error;
      }
      return trimmed;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['test-categories'] }),
    onError: (e: Error) => toast.error(`Failed to create category — ${e.message}`),
  });
}

/** Soft delete — sets is_active = false */
export function useDeleteTest() {
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('tests').update({ is_active: false }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tests'] }),
    onError: (e: Error) => toast.error(`Failed to delete test — ${e.message}`),
  });
}
