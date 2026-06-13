import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { queryClient } from '@/lib/queryClient';
import type { AppUser, UserRole } from '@/types';

export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const { data, error } = await supabase.from('users').select('*').order('username');
      if (error) throw error;
      return data as AppUser[];
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
