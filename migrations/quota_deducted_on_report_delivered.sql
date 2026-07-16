-- Migration: Deduct quota balance on "Report Delivered" (APPLIED to Supabase 2026-07-16)
-- ======================================================================================
-- Before: fn_employee_year_usage counted ALL non-rejected requests, so the
--         balance was effectively consumed the moment a request was created.
-- After:  usage counts only COMPLETED requests. The balance is deducted when
--         the pathologist clicks "Report Delivered" (status → COMPLETED).
--
-- fn_quota_exceeded comparison changed from > to >= so HR approval is
-- restricted once the employee has already received their full annual
-- allotment of delivered reports.

CREATE OR REPLACE FUNCTION public.fn_employee_year_usage(p_employee_id uuid, p_year int)
RETURNS int
LANGUAGE sql
STABLE
AS $$
  select count(*)::int
  from public.requests
  where employee_id = p_employee_id
    and status = 'COMPLETED'
    and extract(year from created_at) = p_year;
$$;

CREATE OR REPLACE FUNCTION public.fn_quota_exceeded(p_employee_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  select public.fn_employee_year_usage(p_employee_id, extract(year from now())::int)
         >= public.fn_employee_limit(p_employee_id);
$$;
