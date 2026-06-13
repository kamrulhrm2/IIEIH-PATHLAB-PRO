// Verifies the admin-configurable annual quota: changing the setting changes enforcement and the view.
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://iczcjxgysatukewxfmzs.supabase.co',
  'sb_publishable_RQfDmfOAoP2_fcT8pDMAQA_ofoKW3Eq'
);

let failures = 0;
const ok = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} - ${name}${extra ? ` (${extra})` : ''}`);
  if (!cond) failures++;
};

const setQuota = async (v) =>
  supabase.from('app_settings').update({ value: String(v) }).eq('key', 'annual_quota');
const getLimit = async () => (await supabase.rpc('fn_quota_limit')).data;

// E001 (Rahim) has several completed requests this year — good for testing the threshold.
const { data: emp } = await supabase.from('employees').select('*').eq('emp_code', 'E001').single();
const { data: used } = await supabase.rpc('fn_employee_year_usage', {
  p_employee_id: emp.id,
  p_year: new Date().getFullYear(),
});
ok('E001 has prior usage to test against', used >= 1, `used=${used}`);

// Default
await setQuota(5);
ok('default limit is 5', (await getLimit()) === 5);

// Raise the quota well above usage -> not exceeded, remaining grows
await setQuota(10);
ok('limit reads 10 after change', (await getLimit()) === 10);
let { data: q10 } = await supabase.from('vw_employee_quota').select('*').eq('emp_code', 'E001').single();
ok('with limit 10 E001 not exceeded', q10.exceeded === false, `exceeded=${q10.exceeded}`);
ok('with limit 10 remaining = 10 - used', q10.remaining === 10 - used, `remaining=${q10.remaining}`);
let { data: ex10 } = await supabase.rpc('fn_quota_exceeded', { p_employee_id: emp.id });
ok('fn_quota_exceeded false at limit 10', ex10 === false);

// Lower the quota to 1 -> exceeded (since used >= 1)
await setQuota(1);
ok('limit reads 1 after change', (await getLimit()) === 1);
let { data: q1 } = await supabase.from('vw_employee_quota').select('*').eq('emp_code', 'E001').single();
ok('with limit 1 E001 exceeded', q1.exceeded === true, `exceeded=${q1.exceeded}`);
ok('with limit 1 remaining = 0', q1.remaining === 0, `remaining=${q1.remaining}`);
let { data: ex1 } = await supabase.rpc('fn_quota_exceeded', { p_employee_id: emp.id });
ok('fn_quota_exceeded true at limit 1', ex1 === true);

// Restore default
await setQuota(5);
ok('restored default limit 5', (await getLimit()) === 5);

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
