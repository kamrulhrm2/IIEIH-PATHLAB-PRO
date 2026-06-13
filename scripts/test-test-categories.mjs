// Verifies creating a new test category and using it on a test. Cleans up after itself.
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

const NEW_CAT = 'Immunology (test)';
const TEST_CODE = 'ZZTEST';

// clean any leftovers from a prior run
await supabase.from('tests').delete().eq('code', TEST_CODE);
await supabase.from('test_categories').delete().eq('name', NEW_CAT);

// seeded categories are present (mirrors useTestCategories)
const { data: seeded } = await supabase.from('test_categories').select('name').order('name');
ok('seeded categories present', seeded.length >= 7, seeded.map((c) => c.name).join(', '));

// create a new category (mirrors useCreateTestCategory)
const { error: addErr } = await supabase.from('test_categories').insert({ name: NEW_CAT });
ok('create new category', !addErr, addErr?.message);

const { data: afterAdd } = await supabase.from('test_categories').select('name').eq('name', NEW_CAT);
ok('new category is listed', afterAdd.length === 1);

// duplicate category rejected by unique constraint
const { error: dupErr } = await supabase.from('test_categories').insert({ name: NEW_CAT });
ok('duplicate category rejected', dupErr?.code === '23505', dupErr?.code);

// a test can be saved using the new category
const { data: test, error: testErr } = await supabase
  .from('tests')
  .insert({ code: TEST_CODE, name: 'Antibody Panel', category: NEW_CAT, price: 1300 })
  .select()
  .single();
ok('test saved with new category', !testErr && test.category === NEW_CAT, testErr?.message);

// cleanup
await supabase.from('tests').delete().eq('code', TEST_CODE);
await supabase.from('test_categories').delete().eq('name', NEW_CAT);
const { data: gone } = await supabase.from('test_categories').select('name').eq('name', NEW_CAT);
ok('cleanup removed the test category', gone.length === 0);

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
