import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { queryClient } from '@/lib/queryClient';
import type { PermissionMatrix } from '@/lib/permissions';
import type { FeatureKey, RolePermission, UserRole } from '@/types';

/** Fetches the full role x feature permission matrix, shaped as a nested map. */
export function useRolePermissions() {
  return useQuery({
    queryKey: ['role-permissions'],
    queryFn: async () => {
      const { data, error } = await supabase.from('role_permissions').select('*');
      if (error) throw error;
      const matrix: PermissionMatrix = {};
      for (const row of (data ?? []) as RolePermission[]) {
        (matrix[row.role] ??= {})[row.feature_key] = row.allowed;
      }
      return matrix;
    },
    staleTime: 30_000,
  });
}

/** Toggle a single (role, feature) cell in the matrix. */
export function useSetRolePermission() {
  return useMutation({
    mutationFn: async (input: { role: UserRole; feature_key: FeatureKey; allowed: boolean }) => {
      if (input.role === 'admin') return; // admin is always-on; nothing to persist
      const { error } = await supabase
        .from('role_permissions')
        .upsert(
          { ...input, updated_at: new Date().toISOString() },
          { onConflict: 'role,feature_key' }
        );
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['role-permissions'] }),
    onError: (e: Error) => toast.error(`Failed to update permission — ${e.message}`),
  });
}
