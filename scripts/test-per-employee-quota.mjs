// Verifies per-employee quota overrides (individual + bulk) and that enforcement uses them.
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

const quotaRow = async (code) =>
  (await supabase.from('vw_employee_quota').select('*').eq('emp_code', code).single()).data;
const setOverride = async (codes, quota) =>
  supabase.from('employees').update({ quota_override: quota }).in('emp_code', codes);

// Ensure global default is 5 and clear any overrides first
await supabase.from('app_settings').update({ value: '5' }).eq('key', 'annual_quota');
await setOverride(['E001', 'E002', 'E003', 'E004', 'E005'], null);

// Baseline: everyone on default
let e2 = await quotaRow('E002');
ok('E002 starts on default (limit 5, not custom)', e2.limit_value === 5 && e2.is_custom === false);

// --- Individual override --- give E002 a personal quota of 2
await setOverride(['E002'], 2);
e2 = await quotaRow('E002');
ok('E002 individual override applied (limit 2, custom)', e2.limit_value === 2 && e2.is_custom === true);
const { data: e2Emp } = await supabase.from('employees').select('id').eq('emp_code', 'E002').single();
const { data: e2Exceeded } = await supabase.rpc('fn_quota_exceeded', { p_employee_id: e2Emp.id });
ok('E002 (0 used) not exceeded at limit 2', e2Exceeded === false);

// E001 has 5 completed — give E001 override 3 -> exceeded
await setOverride(['E001'], 3);
const e1 = await quotaRow('E001');
ok('E001 override 3 -> exceeded (used 5 >= 3)', e1.limit_value === 3 && e1.exceeded === true && e1.remaining === 0);

// Other employees still on default (override is per-employee, not global)
const e3 = await quotaRow('E003');
ok('E003 unaffected by others (still default 5)', e3.limit_value === 5 && e3.is_custom === false);

// --- Bulk override --- set E003, E004, E005 all to 8 in one update
await setOverride(['E003', 'E004', 'E005'], 8);
const bulk = await Promise.all(['E003', 'E004', 'E005'].map(quotaRow));
ok('bulk set 3 employees to limit 8', bulk.every((b) => b.limit_value === 8 && b.is_custom === true));

// --- Bulk reset to default (null) ---
await setOverride(['E003', 'E004', 'E005'], null);
const reset = await Promise.all(['E003', 'E004', 'E005'].map(quotaRow));
ok('bulk reset 3 employees to default', reset.every((b) => b.limit_value === 5 && b.is_custom === false));

// cleanup all overrides
await setOverride(['E001', 'E002', 'E003', 'E004', 'E005'], null);
const cleaned = await Promise.all(['E001', 'E002'].map(quotaRow));
ok('cleanup cleared overrides', cleaned.every((b) => b.is_custom === false));

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
