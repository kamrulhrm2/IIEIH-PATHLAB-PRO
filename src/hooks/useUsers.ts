import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { queryClient } from '@/lib/queryClient';
import type { AppUser, UserRole } from '@/types';

/**
 * Fetches ALL users with pagination to bypass Supabase's 1000-row default limit.
 */
const USERS_PAGE_SIZE = 1000;

export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const allUsers: AppUser[] = [];
      let from = 0;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from('users')
          .select('*')
          .order('username')
          .range(from, from + USERS_PAGE_SIZE - 1);

        if (error) throw error;

        if (data && data.length > 0) {
          allUsers.push(...(data as AppUser[]));
          from += USERS_PAGE_SIZE;
          hasMore = data.length === USERS_PAGE_SIZE;
        } else {
          hasMore = false;
        }
      }

      return allUsers;
    },
  });
}

/** Active doctors only — used to assign a reviewer on a new request. */
export function useDoctors() {
  return useQuery({
    queryKey: ['doctors'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('users')
        .select('id, name, username, emp_code')
        .eq('role', 'doctor')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data as Pick<AppUser, 'id' | 'name' | 'username' | 'emp_code'>[];
    },
    staleTime: 60_000,
  });
}

interface CreateUserInput {
  username: string;
  name: string;
  role: UserRole;
  email: string | null;
  emp_code: string | null;
}

export function useCreateUser() {
  return useMutation({
    mutationFn: async (input: CreateUserInput) => {
      const { data: hash, error: hashError } = await supabase.rpc('fn_hash_password', {
        plain: input.username,
      });
      if (hashError) throw hashError;
      const { error } = await supabase.from('users').insert({ ...input, password_hash: hash });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
    onError: (e: Error) => toast.error(`Failed to create user — ${e.message}`),
  });
}

export function useUpdateUser() {
  return useMutation({
    mutationFn: async (input: {
      id: string;
      role?: UserRole;
      email?: string | null;
      is_active?: boolean;
      resetPasswordTo?: string;
    }) => {
      const { id, resetPasswordTo, ...fields } = input;
      const payload: Record<string, unknown> = { ...fields };
      if (resetPasswordTo) {
        const { data: hash, error: hashError } = await supabase.rpc('fn_hash_password', {
          plain: resetPasswordTo,
        });
        if (hashError) throw hashError;
        payload.password_hash = hash;
      }
      const { error } = await supabase.from('users').update(payload).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
    onError: (e: Error) => toast.error(`Failed to update user — ${e.message}`),
  });
}

/**
 * Bulk update user roles for employees by their emp_codes.
 * Only updates EXISTING user accounts - skips employees without accounts.
 * Returns counts: updated (had account, role changed), skipped (no account).
 */
export function useBulkUpdateUserRole() {
  return useMutation({
    mutationFn: async ({ empCodes, role }: { empCodes: string[]; role: UserRole }) => {
      if (empCodes.length === 0) {
        return { updated: 0, skipped: 0, total: 0 };
      }

      // Step 1: Find which emp_codes have user accounts (chunked to avoid limits)
      const CHUNK = 500;
      const existingUsernames = new Set<string>();
      for (let i = 0; i < empCodes.length; i += CHUNK) {
        const slice = empCodes.slice(i, i + CHUNK);
        const { data, error } = await supabase
          .from('users')
          .select('username')
          .in('username', slice);
        if (error) throw error;
        (data ?? []).forEach((u) => existingUsernames.add(u.username));
      }

      const toUpdate = empCodes.filter((c) => existingUsernames.has(c));
      const skipped = empCodes.length - toUpdate.length;

      if (toUpdate.length === 0) {
        return { updated: 0, skipped, total: empCodes.length };
      }

      // Step 2: Update roles in chunks
      for (let i = 0; i < toUpdate.length; i += CHUNK) {
        const slice = toUpdate.slice(i, i + CHUNK);
        const { error } = await supabase
          .from('users')
          .update({ role })
          .in('username', slice);
        if (error) throw error;
      }

      return { updated: toUpdate.length, skipped, total: empCodes.length };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['doctors'] });

      if (result.updated > 0 && result.skipped > 0) {
        toast.success(
          `✅ ${result.updated} user role(s) updated · ⚠️ ${result.skipped} skipped (no account)`
        );
      } else if (result.updated > 0) {
        toast.success(`✅ ${result.updated} user role(s) updated successfully`);
      } else if (result.skipped > 0) {
        toast.warning(
          `⚠️ No roles updated — ${result.skipped} selected employee(s) have no user account`
        );
      }
    },
    onError: (e: Error) => toast.error(`Failed to update roles — ${e.message}`),
  });
}

/** Self-service password change — any logged-in user can change their own password. */
export function useChangePassword() {
  return useMutation({
    mutationFn: async ({
      userId,
      currentPassword,
      newPassword,
    }: {
      userId: string;
      currentPassword: string;
      newPassword: string;
    }) => {
      const { data: row, error } = await supabase
        .from('users')
        .select('password_hash')
        .eq('id', userId)
        .single();
      if (error || !row) throw new Error('Account not found');

      const { data: valid, error: verifyError } = await supabase.rpc('fn_verify_password', {
        plain: currentPassword,
        hash: row.password_hash,
      });
      if (verifyError) throw verifyError;
      if (!valid) throw new Error('Current password is incorrect');

      const { data: hash, error: hashError } = await supabase.rpc('fn_hash_password', {
        plain: newPassword,
      });
      if (hashError) throw hashError;

      const { error: updateError } = await supabase
        .from('users')
        .update({ password_hash: hash })
        .eq('id', userId);
      if (updateError) throw updateError;
    },
  });
}

export function useDeleteUser() {
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('users').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
    onError: (e: Error) => toast.error(`Failed to delete user — ${e.message}`),
  });
}
