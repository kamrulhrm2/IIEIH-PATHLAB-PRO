// Verifies the doctor's pre-approval test editing: remove a test, then include an extra test.
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

const { data: emp } = await supabase.from('users').select('*').eq('username', 'E001').single();
const { data: doctor } = await supabase.from('users').select('*').eq('username', 'E002').single();
const { data: employee } = await supabase.from('employees').select('*').eq('emp_code', 'E001').single();
const { data: tests } = await supabase.from('tests').select('*').eq('is_active', true).order('code');
const cbc = tests.find((t) => t.code === 'CBC');
const bg = tests.find((t) => t.code === 'BG');
const ecg = tests.find((t) => t.code === 'ECG'); // the extra test the doctor will add

// Create a PENDING_DOCTOR request with CBC + BG assigned to the doctor
const { data: req } = await supabase.from('requests').insert({
  requester_id: emp.id, requester_name: emp.name, requester_role: emp.role,
  employee_id: employee.id, employee_code: employee.emp_code, employee_name: employee.name,
  ben_name: employee.name, ben_relation: 'Self',
  assigned_doctor_id: doctor.id, assigned_doctor_name: doctor.name,
}).select().single();
await supabase.from('request_tests').insert([
  { request_id: req.id, test_id: cbc.id },
  { request_id: req.id, test_id: bg.id },
]);

const list1 = async () => {
  const { data } = await supabase.from('request_tests').select('id, test_id, approval').eq('request_id', req.id);
  return data;
};
let rts = await list1();
ok('request starts with 2 tests (CBC, BG)', rts.length === 2);

// Doctor REMOVES the BG test (useRemoveRequestTest -> delete row)
const bgRow = rts.find((r) => r.test_id === bg.id);
const { error: delErr } = await supabase.from('request_tests').delete().eq('id', bgRow.id);
ok('doctor can remove a test', !delErr, delErr?.message);
rts = await list1();
ok('request now has 1 test (BG removed)', rts.length === 1 && rts[0].test_id === cbc.id);

// Doctor INCLUDES an extra test ECG (useAddRequestTest -> insert pending row)
const { error: addErr } = await supabase.from('request_tests')
  .insert({ request_id: req.id, test_id: ecg.id, approval: 'pending' });
ok('doctor can include an extra test', !addErr, addErr?.message);
rts = await list1();
ok('request now has 2 tests (CBC, ECG)', rts.length === 2 && rts.some((r) => r.test_id === ecg.id));
ok('added test starts as pending', rts.find((r) => r.test_id === ecg.id)?.approval === 'pending');

// The UNIQUE(request_id, test_id) constraint blocks adding a duplicate
const { error: dupErr } = await supabase.from('request_tests')
  .insert({ request_id: req.id, test_id: cbc.id, approval: 'pending' });
ok('duplicate test insert is rejected by the DB', !!dupErr, dupErr?.code);

// Summary view reflects the edited set (2 total, 0 approved yet)
const { data: summary } = await supabase.from('vw_request_summary').select('*').eq('id', req.id).single();
ok('summary total_tests = 2 after edits', summary.total_tests === 2, String(summary.total_tests));

// cleanup
await supabase.from('requests').delete().eq('id', req.id);

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
