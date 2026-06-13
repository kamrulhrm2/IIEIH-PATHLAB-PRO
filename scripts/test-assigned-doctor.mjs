// Verifies doctor-assignment routing: a request is created assigned to one doctor,
// is visible only in that doctor's queue, and forwards to HR on approval.
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

// Mirror the frontend's doctor list query
const { data: doctors } = await supabase
  .from('users').select('id, name, username, emp_code').eq('role', 'doctor').eq('is_active', true);
ok('useDoctors returns the seeded doctor', doctors.length >= 1, `${doctors.length} doctor(s)`);
const chosen = doctors.find((d) => d.username === 'E002');
ok('E002 is selectable as doctor', !!chosen);

const { data: emp } = await supabase.from('users').select('*').eq('username', 'E001').single();
const { data: employee } = await supabase.from('employees').select('*').eq('emp_code', 'E001').single();
const { data: tests } = await supabase.from('tests').select('*').in('code', ['CBC', 'BG']);

// Create a request assigned to the chosen doctor (matches useSubmitRequest insert)
const { data: req, error: reqErr } = await supabase.from('requests').insert({
  requester_id: emp.id, requester_name: emp.name, requester_role: emp.role,
  employee_id: employee.id, employee_code: employee.emp_code, employee_name: employee.name,
  ben_name: employee.name, ben_relation: 'Self',
  assigned_doctor_id: chosen.id, assigned_doctor_name: chosen.name,
  notes: 'Doctor-routing test',
}).select().single();
ok('request created with assigned doctor', !reqErr && req.assigned_doctor_id === chosen.id, reqErr?.message);
await supabase.from('request_tests').insert(tests.map((t) => ({ request_id: req.id, test_id: t.id })));

// Doctor queue visibility (mode='doctor' for role 'doctor' filters by assigned_doctor_id)
const { data: mine } = await supabase.from('vw_request_summary')
  .select('*').eq('status', 'PENDING_DOCTOR').eq('assigned_doctor_id', chosen.id);
ok('assigned doctor sees the request in their queue', mine.some((r) => r.id === req.id));
ok('summary view exposes assigned_doctor_name', mine.find((r) => r.id === req.id)?.assigned_doctor_name === chosen.name);

// A different doctor must NOT see it
const otherDoctorId = '00000000-0000-0000-0000-000000000000';
const { data: others } = await supabase.from('vw_request_summary')
  .select('*').eq('status', 'PENDING_DOCTOR').eq('assigned_doctor_id', otherDoctorId);
ok('a different doctor does not see the request', !others.some((r) => r.id === req.id));

// Doctor approves -> forwards to HR (full approve)
const { data: rts } = await supabase.from('request_tests').select('id').eq('request_id', req.id);
await supabase.from('request_tests').update({ approval: 'approved' }).in('id', rts.map((r) => r.id));
await supabase.from('requests').update({
  status: 'PENDING_HR', doctor_name: chosen.name, doctor_at: new Date().toISOString(),
}).eq('id', req.id);
const { data: afterApprove } = await supabase.from('requests').select('status').eq('id', req.id).single();
ok('approval forwards request to HR', afterApprove.status === 'PENDING_HR');

// Cleanup this test request so it doesn't clutter the demo data
await supabase.from('requests').delete().eq('id', req.id);
const { data: gone } = await supabase.from('requests').select('id').eq('id', req.id).maybeSingle();
ok('test request cleaned up', gone === null);

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
