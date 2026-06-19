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
 * - Auto-creates missing categories
 * - UPSERT by code: New tests inserted, existing tests updated
 * - Returns counts for user feedback
 */
export function useBulkInsertTests() {
  return useMutation({
    mutationFn: async (rows: NewLabTest[]) => {
      if (rows.length === 0) {
        return { total: 0, inserted: 0, updated: 0 };
      }

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

      // Check existing tests by code
      const testCodes = rows.map((r) => r.code);
      const { data: existing, error: fetchError } = await supabase
        .from('tests')
        .select('code')
        .in('code', testCodes);

      if (fetchError) {
        throw new Error(`Failed to check existing tests: ${fetchError.message}`);
      }

      const existingCodes = new Set((existing ?? []).map((t) => t.code));
      const insertCount = rows.filter((r) => !existingCodes.has(r.code)).length;
      const updateCount = rows.filter((r) => existingCodes.has(r.code)).length;

      // UPSERT - Insert new tests, update existing ones by code
      const { error } = await supabase.from('tests').upsert(rows, {
        onConflict: 'code',
        ignoreDuplicates: false,
      });

      if (error) throw error;

      return {
        total: rows.length,
        inserted: insertCount,
        updated: updateCount,
      };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['tests'] });
      queryClient.invalidateQueries({ queryKey: ['test-categories'] });

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
