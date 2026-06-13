// Verifies the self-service change-password flow, then restores the default so demo creds stay E00x/E00x.
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

// Mirrors AuthContext.login
async function login(username, password) {
  const { data: row } = await supabase
    .from('users').select('*').eq('username', username).eq('is_active', true).maybeSingle();
  if (!row) return null;
  const { data: valid } = await supabase.rpc('fn_verify_password', { plain: password, hash: row.password_hash });
  return valid ? row : null;
}

// Mirrors useChangePassword
async function changePassword(userId, currentPassword, newPassword) {
  const { data: row } = await supabase.from('users').select('password_hash').eq('id', userId).single();
  const { data: valid } = await supabase.rpc('fn_verify_password', { plain: currentPassword, hash: row.password_hash });
  if (!valid) throw new Error('Current password is incorrect');
  const { data: hash } = await supabase.rpc('fn_hash_password', { plain: newPassword });
  await supabase.from('users').update({ password_hash: hash }).eq('id', userId);
}

// Requirement 1: Employee ID is the default user ID AND default password for every seeded user.
for (const id of ['E000', 'E001', 'E002', 'E003', 'E004']) {
  const u = await login(id, id);
  ok(`default login ${id}/${id} works`, !!u);
}

const e1 = await login('E001', 'E001');

// Wrong current password is rejected
let rejected = false;
try { await changePassword(e1.id, 'wrong-current', 'NewPass123'); } catch { rejected = true; }
ok('change rejected when current password is wrong', rejected);

// Correct current password changes it
await changePassword(e1.id, 'E001', 'NewPass123');
ok('cannot log in with the OLD password after change', (await login('E001', 'E001')) === null);
ok('can log in with the NEW password after change', !!(await login('E001', 'NewPass123')));

// Restore default so demo credentials remain E001/E001
await changePassword(e1.id, 'NewPass123', 'E001');
ok('default password restored (E001/E001 works again)', !!(await login('E001', 'E001')));

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
