-- Migration: Fix request_timeline table stage check constraint
-- ============================================================
-- Issue: request_timeline.stage CHECK constraint missing MEDICAL_APPROVED and MEDICAL_REJECTED
-- Error: "Action failed — new row for relation 'request_timeline' violates check constraint 'request_timeline_stage_check'"
-- Cause: When medical services tries to approve/reject, it logs a timeline event with MEDICAL_APPROVED/MEDICAL_REJECTED stage
--        but those stages aren't in the constraint
--
-- Solution: Drop old constraint and add new one with all valid timeline stages

ALTER TABLE request_timeline DROP CONSTRAINT request_timeline_stage_check;

ALTER TABLE request_timeline ADD CONSTRAINT request_timeline_stage_check CHECK (
  stage IN (
    'CREATED',
    'DOCTOR_APPROVED',
    'DOCTOR_PARTIAL_APPROVED',
    'DOCTOR_REJECTED',
    'HR_APPROVED',
    'HR_RESTRICTED',
    'ADMIN_APPROVED',
    'ADMIN_REJECTED',
    'MEDICAL_APPROVED',      -- NEW: Medical Services approved
    'MEDICAL_REJECTED',      -- NEW: Medical Services rejected
    'PATH_PARTIAL',
    'COMPLETED'
  )
);

-- Verification query (run in Supabase SQL Editor):
-- SELECT constraint_name, constraint_definition FROM information_schema.constraint_column_usage ccu
-- JOIN information_schema.check_constraints cc ON ccu.constraint_name = cc.constraint_name
-- WHERE ccu.table_name = 'request_timeline';
