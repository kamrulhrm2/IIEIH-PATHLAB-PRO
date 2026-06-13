// End-to-end backend smoke test — mirrors the exact calls the frontend makes.
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

async function login(username, password) {
  const { data: row } = await supabase
    .from('users').select('*').eq('username', username).eq('is_active', true).maybeSingle();
  if (!row) return null;
  const { data: valid } = await supabase.rpc('fn_verify_password', { plain: password, hash: row.password_hash });
  return valid ? row : null;
}

// 1. Auth
ok('login rejects wrong password', (await login('E001', 'wrong')) === null);
const emp = await login('E001', 'E001');
ok('login E001 (employee)', !!emp && emp.role === 'user');
const doc = await login('E002', 'E002');
ok('login E002 (doctor)', !!doc && doc.role === 'doctor');
const hr = await login('E003', 'E003');
ok('login E003 (hr)', !!hr && hr.role === 'hr');
const path = await login('E004', 'E004');
ok('login E004 (pathologist)', !!path && path.role === 'pathologist');

// 2. Submit request as E001 for Self with 3 tests
const { data: employee } = await supabase.from('employees').select('*').eq('emp_code', 'E001').single();
const { data: tests } = await supabase.from('tests').select('*').in('code', ['CBC', 'LFT', 'TSH']);
const { data: req, error: reqErr } = await supabase.from('requests').insert({
  requester_id: emp.id, requester_name: emp.name, requester_role: emp.role,
  employee_id: employee.id, employee_code: employee.emp_code, employee_name: employee.name,
  ben_name: employee.name, ben_relation: 'Self', notes: 'Smoke test — routine checkup',
}).select().single();
ok('request inserted', !reqErr && !!req, reqErr?.message);
ok('req_no auto-generated', /^REQ-[A-F0-9]{8}$/.test(req?.req_no ?? ''), req?.req_no);
ok('initial status PENDING_DOCTOR', req?.status === 'PENDING_DOCTOR');

await supabase.from('request_tests').insert(tests.map((t) => ({ request_id: req.id, test_id: t.id })));
await supabase.from('request_timeline').insert({
  request_id: req.id, stage: 'CREATED', actor_id: emp.id, actor_name: emp.name, actor_role: emp.role, note: 'Request submitted',
});

// 3. Doctor partial approve (2 of 3)
const { data: rts } = await supabase.from('request_tests').select('*, test:tests(*)').eq('request_id', req.id).order('created_at');
ok('3 request_tests created', rts.length === 3);
const [a, b, c] = rts;
await supabase.from('request_tests').update({ approval: 'approved' }).in('id', [a.id, b.id]);
await supabase.from('request_tests').update({ approval: 'rejected' }).eq('id', c.id);
await supabase.from('requests').update({
  status: 'PENDING_HR_PARTIAL', doctor_name: doc.name, doctor_at: new Date().toISOString(),
}).eq('id', req.id);
await supabase.from('request_timeline').insert({
  request_id: req.id, stage: 'DOCTOR_PARTIAL_APPROVED', actor_id: doc.id, actor_name: doc.name, actor_role: doc.role,
});

// 4. HR quota check + approve
const { data: exceeded } = await supabase.rpc('fn_quota_exceeded', { p_employee_id: employee.id });
ok('quota not exceeded for E001', exceeded === false);
await supabase.from('requests').update({
  status: exceeded ? 'HR_RESTRICTED' : 'PENDING_PATHOLOGY', hr_name: hr.name, hr_at: new Date().toISOString(),
}).eq('id', req.id);
await supabase.from('request_timeline').insert({
  request_id: req.id, stage: 'HR_APPROVED', actor_id: hr.id, actor_name: hr.name, actor_role: hr.role,
});

// 5. Pathologist completes all approved tests
await supabase.from('request_tests').update({ approval: 'completed' }).in('id', [a.id, b.id]);
const { error: completeErr } = await supabase.from('requests').update({
  status: 'COMPLETED', pathologist_name: path.name, pathologist_at: new Date().toISOString(),
}).eq('id', req.id);
ok('complete update succeeded', !completeErr, completeErr?.message);
await supabase.from('request_timeline').insert({
  request_id: req.id, stage: 'COMPLETED', actor_id: path.id, actor_name: path.name, actor_role: path.role,
});

const { data: final } = await supabase.from('requests').select('*').eq('id', req.id).single();
ok('status COMPLETED', final.status === 'COMPLETED');
ok('slip_no auto-assigned by trigger', /^SLP-[A-F0-9]{8}$/.test(final.slip_no ?? ''), final.slip_no);
ok('completed_at set by trigger', !!final.completed_at);

// 6. Views & functions
const { data: summary } = await supabase.from('vw_request_summary').select('*').eq('id', req.id).single();
ok('vw_request_summary counts', summary.total_tests === 3 && summary.approved_tests === 2, `total=${summary.total_tests} approved=${summary.approved_tests}`);
ok('vw_request_summary approved_amount = CBC+LFT (1700)', Number(summary.approved_amount) === 1700, summary.approved_amount);

const { data: usage } = await supabase.rpc('fn_employee_year_usage', { p_employee_id: employee.id, p_year: new Date().getFullYear() });
ok('fn_employee_year_usage = 1', usage === 1, String(usage));

const { data: quota } = await supabase.from('vw_employee_quota').select('*').eq('emp_code', 'E001').single();
ok('vw_employee_quota used=1 remaining=4', quota.used === 1 && quota.remaining === 4 && quota.exceeded === false);

const { data: monthly } = await supabase.from('vw_monthly_activity').select('*');
ok('vw_monthly_activity has rows', monthly.length > 0);

const { data: deptSum } = await supabase.from('vw_department_summary').select('*').eq('department', 'Finance');
ok('vw_department_summary Finance row', deptSum.length === 1 && deptSum[0].completed === 1);

// 7. Timeline immutability
const { data: tl } = await supabase.from('request_timeline').select('*').eq('request_id', req.id).order('created_at');
ok('timeline has 4 events', tl.length === 4, tl.map((t) => t.stage).join('>'));
const { error: immutableErr } = await supabase.from('request_timeline').update({ note: 'tamper' }).eq('id', tl[0].id);
ok('timeline UPDATE blocked by trigger', !!immutableErr, immutableErr?.message?.slice(0, 50));

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
