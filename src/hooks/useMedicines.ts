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

export type NewMedicine = Omit<Medicine, 'id' | 'created_at' | 'updated_at'>;

const IMPORT_CHUNK = 500;
/** medicines_name_strength_key is a case-insensitive expression index
 * (lower(name), COALESCE(lower(strength),'')) — PostgREST upsert only
 * targets plain-column unique constraints, so duplicates are matched
 * client-side and routed to UPDATE instead of a conflict-based upsert. */
const dupKey = (name: string, strength: string | null) =>
  `${name.trim().toLowerCase()}|${(strength ?? '').trim().toLowerCase()}`;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Bulk import medicines from CSV. Existing medicines (matched case-insensitively
 * on name+strength) are UPDATED with the new row's details; everything else is
 * inserted. Supports unlimited rows via chunking.
 */
export function useBulkInsertMedicines() {
  return useMutation({
    mutationFn: async (rows: NewMedicine[]) => {
      if (rows.length === 0) return { total: 0, inserted: 0, updated: 0, failedBatches: 0 };

      // Pre-fetch existing (name, strength) -> id, paginated
      const existing = new Map<string, string>();
      let from = 0;
      let hasMore = true;
      while (hasMore) {
        const { data, error } = await supabase
          .from('medicines')
          .select('id, name, strength')
          .range(from, from + 1000 - 1);
        if (error) throw error;
        (data ?? []).forEach((m) => existing.set(dupKey(m.name, m.strength), m.id));
        hasMore = (data?.length ?? 0) === 1000;
        from += 1000;
      }

      const toInsert: NewMedicine[] = [];
      const toUpdate: { id: string; fields: NewMedicine }[] = [];
      for (const row of rows) {
        const id = existing.get(dupKey(row.name, row.strength));
        if (id) toUpdate.push({ id, fields: row });
        else toInsert.push(row);
      }

      let inserted = 0;
      let updated = 0;
      const errors: string[] = [];

      for (const batch of chunk(toInsert, IMPORT_CHUNK)) {
        const { error } = await supabase.from('medicines').insert(batch);
        if (error) errors.push(`Insert batch: ${error.message}`);
        else inserted += batch.length;
      }

      // Row-level updates (each row can carry different values) — bounded concurrency
      for (const batch of chunk(toUpdate, 25)) {
        const results = await Promise.all(
          batch.map((u) =>
            supabase
              .from('medicines')
              .update({ ...u.fields, updated_at: new Date().toISOString() })
              .eq('id', u.id)
          )
        );
        results.forEach((r) => {
          if (r.error) errors.push(`Update: ${r.error.message}`);
          else updated += 1;
        });
      }

      if (inserted === 0 && updated === 0 && errors.length > 0) {
        throw new Error(errors[0]);
      }

      return { total: rows.length, inserted, updated, failedBatches: errors.length };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['medicines'] });
      const failed = result.failedBatches ?? 0;
      if (failed > 0) {
        toast.warning(
          `⚠️ Partial import: ${result.inserted + result.updated}/${result.total} processed. ${failed} row(s)/batch(es) failed.`
        );
      } else if (result.inserted > 0 && result.updated > 0) {
        toast.success(
          `✅ Import complete: ${result.inserted} new + ${result.updated} updated = ${result.total} total`
        );
      } else if (result.inserted > 0) {
        toast.success(`✅ ${result.inserted} new medicine(s) imported successfully`);
      } else if (result.updated > 0) {
        toast.success(`✅ ${result.updated} existing medicine(s) updated successfully`);
      } else {
        toast.success(`✅ Import processed: ${result.total} records`);
      }
    },
    onError: (e: Error) => {
      console.error('[MEDICINES BULK IMPORT ERROR]', e);
      toast.error(`❌ Bulk import failed — ${e.message}`);
    },
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
