import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { queryClient } from '@/lib/queryClient';
import { useAuth } from '@/context/AuthContext';
import type {
  Employee,
  EmployeeQuota,
  PathRequest,
  QueueMode,
  RelationType,
  RequestSummary,
  RequestTest,
  TestApproval,
  TimelineEvent,
  TimelineStage,
} from '@/types';

export function useRequestList(mode: QueueMode) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['requests', mode, user?.id],
    enabled: !!user,
    staleTime: 10_000,
    queryFn: async () => {
      let q = supabase
        .from('vw_request_summary')
        .select('*')
        .order('created_at', { ascending: false });
      if (mode === 'mine') q = q.eq('requester_id', user!.id);
      else if (mode === 'doctor') {
        q = q.eq('status', 'PENDING_DOCTOR');
        // A doctor sees only requests assigned to them; admin sees every pending review.
        if (user!.role === 'doctor') q = q.eq('assigned_doctor_id', user!.id);
      }
      else if (mode === 'hr') q = q.in('status', ['PENDING_HR', 'PENDING_HR_PARTIAL']);
      else if (mode === 'restricted') q = q.in('status', ['HR_RESTRICTED', 'PENDING_ADMIN']);
      else if (mode === 'medical') q = q.eq('status', 'PENDING_MEDICAL');
      else if (mode === 'pathology') q = q.in('status', ['PENDING_PATHOLOGY', 'PATH_PARTIAL']);
      const { data, error } = await q;
      if (error) throw error;
      return data as RequestSummary[];
    },
  });
}

export function useRequestDetail(requestId: string | null | undefined) {
  return useQuery({
    queryKey: ['request-detail', requestId],
    enabled: !!requestId,
    queryFn: async () => {
      const [testsRes, tlRes] = await Promise.all([
        supabase
          .from('request_tests')
          .select('*, test:tests(*)')
          .eq('request_id', requestId!)
          .order('created_at'),
        supabase
          .from('request_timeline')
          .select('*')
          .eq('request_id', requestId!)
          .order('created_at'),
      ]);
      if (testsRes.error) throw testsRes.error;
      if (tlRes.error) throw tlRes.error;
      return {
        tests: testsRes.data as unknown as RequestTest[],
        timeline: tlRes.data as TimelineEvent[],
      };
    },
  });
}

/** Doctor provision — include an additional test on a request before approval. */
export function useAddRequestTest() {
  return useMutation({
    mutationFn: async ({ requestId, testId }: { requestId: string; testId: string }) => {
      const { error } = await supabase
        .from('request_tests')
        .insert({ request_id: requestId, test_id: testId, approval: 'pending' });
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['request-detail', vars.requestId] });
      queryClient.invalidateQueries({ queryKey: ['requests'] });
    },
    onError: (e: Error) => toast.error(`Could not add test — ${e.message}`),
  });
}

/** Doctor control — remove a test from a request before approval. */
export function useRemoveRequestTest() {
  return useMutation({
    mutationFn: async ({ id }: { id: string; requestId: string }) => {
      const { error } = await supabase.from('request_tests').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['request-detail', vars.requestId] });
      queryClient.invalidateQueries({ queryKey: ['requests'] });
    },
    onError: (e: Error) => toast.error(`Could not remove test — ${e.message}`),
  });
}

export function useEmployeeUsage(employeeId: string | null | undefined) {
  return useQuery({
    queryKey: ['usage', employeeId],
    enabled: !!employeeId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('fn_employee_year_usage', {
        p_employee_id: employeeId,
        p_year: new Date().getFullYear(),
      });
      if (error) throw error;
      return (data ?? 0) as number;
    },
  });
}

/** Current-year requests for one employee — used by the HR quota panel. */
export function useEmployeeYearRequests(employeeId: string | null | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['employee-year-requests', employeeId],
    enabled: !!employeeId && enabled,
    queryFn: async () => {
      const yearStart = `${new Date().getFullYear()}-01-01`;
      const { data, error } = await supabase
        .from('vw_request_summary')
        .select('*')
        .eq('employee_id', employeeId!)
        .gte('created_at', yearStart)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as RequestSummary[];
    },
  });
}

export function useEmployeeQuotas() {
  return useQuery({
    queryKey: ['quota'],
    queryFn: async () => {
      const { data, error } = await supabase.from('vw_employee_quota').select('*').order('emp_code');
      if (error) throw error;
      return data as EmployeeQuota[];
    },
  });
}

export interface SubmitRequestInput {
  employee: Employee;
  benName: string;
  benRelation: RelationType;
  benDob: string | null;
  dependentId: string | null;
  testIds: string[];
  notes: string;
  assignedDoctorId: string;
  assignedDoctorName: string;
}

export function useSubmitRequest() {
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: SubmitRequestInput) => {
      if (!user) throw new Error('Not authenticated');
      const { data: req, error } = await supabase
        .from('requests')
        .insert({
          requester_id: user.id,
          requester_name: user.name,
          requester_role: user.role,
          employee_id: input.employee.id,
          employee_code: input.employee.emp_code,
          employee_name: input.employee.name,
          ben_name: input.benName,
          ben_relation: input.benRelation,
          ben_dob: input.benDob,
          dependent_id: input.dependentId,
          assigned_doctor_id: input.assignedDoctorId,
          assigned_doctor_name: input.assignedDoctorName,
          notes: input.notes.trim() || null,
        })
        .select()
        .single();
      if (error) throw error;

      const { error: testsError } = await supabase
        .from('request_tests')
        .insert(input.testIds.map((test_id) => ({ request_id: req.id, test_id })));
      if (testsError) throw testsError;

      const { error: tlError } = await supabase.from('request_timeline').insert({
        request_id: req.id,
        stage: 'CREATED',
        actor_id: user.id,
        actor_name: user.name,
        actor_role: user.role,
        note: 'Request submitted',
      });
      if (tlError) throw tlError;

      return req as PathRequest;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requests'] });
      queryClient.invalidateQueries({ queryKey: ['quota'] });
    },
    onError: (e: Error) => toast.error(`Failed to submit request — ${e.message}`),
  });
}

export interface RequestActionInput {
  request: PathRequest;
  updates: Partial<PathRequest>;
  testUpdates?: { id: string; approval: TestApproval }[];
  stage: TimelineStage;
  note?: string;
}

export function useRequestAction() {
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: RequestActionInput) => {
      if (!user) throw new Error('Not authenticated');

      const { error: reqError } = await supabase
        .from('requests')
        .update(input.updates)
        .eq('id', input.request.id);
      if (reqError) throw reqError;

      if (input.testUpdates && input.testUpdates.length > 0) {
        // Group by target approval so each batch is a single .in() update
        const byApproval = new Map<TestApproval, string[]>();
        for (const tu of input.testUpdates) {
          const list = byApproval.get(tu.approval) ?? [];
          list.push(tu.id);
          byApproval.set(tu.approval, list);
        }
        for (const [approval, ids] of byApproval) {
          const { error } = await supabase
            .from('request_tests')
            .update({ approval })
            .in('id', ids);
          if (error) throw error;
        }
      }

      const { error: tlError } = await supabase.from('request_timeline').insert({
        request_id: input.request.id,
        stage: input.stage,
        actor_id: user.id,
        actor_name: user.name,
        actor_role: user.role,
        note: input.note?.trim() || null,
      });
      if (tlError) throw tlError;
    },
    onSuccess: (_data, input) => {
      queryClient.invalidateQueries({ queryKey: ['requests'] });
      queryClient.invalidateQueries({ queryKey: ['request-detail', input.request.id] });
      queryClient.invalidateQueries({ queryKey: ['usage'] });
      queryClient.invalidateQueries({ queryKey: ['quota'] });
      queryClient.invalidateQueries({ queryKey: ['employee-year-requests'] });
    },
    onError: (e: Error) => toast.error(`Action failed — ${e.message}`),
  });
}
