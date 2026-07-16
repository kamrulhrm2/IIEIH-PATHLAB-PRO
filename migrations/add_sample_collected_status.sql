-- Migration: Add SAMPLE_COLLECTED status and timeline stage
-- ==========================================================
-- New pathology workflow:
--   PENDING_PATHOLOGY → (Sample Collection) → SAMPLE_COLLECTED → (Report Delivered) → COMPLETED
--
-- Run this in the Supabase SQL Editor for project PathLab Pro.

-- 1. requests.status must accept SAMPLE_COLLECTED
ALTER TABLE requests DROP CONSTRAINT requests_status_check;
ALTER TABLE requests ADD CONSTRAINT requests_status_check CHECK (
  status IN (
    'PENDING_DOCTOR',
    'DOCTOR_REJECTED',
    'PENDING_HR',
    'PENDING_HR_PARTIAL',
    'HR_RESTRICTED',
    'PENDING_ADMIN',
    'ADMIN_REJECTED',
    'PENDING_MEDICAL',
    'MEDICAL_REJECTED',
    'PENDING_PATHOLOGY',
    'SAMPLE_COLLECTED',      -- NEW: samples physically collected by pathologist
    'PATH_PARTIAL',
    'COMPLETED'
  )
);

-- 2. request_timeline.stage must accept SAMPLE_COLLECTED
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
    'MEDICAL_APPROVED',
    'MEDICAL_REJECTED',
    'SAMPLE_COLLECTED',      -- NEW
    'PATH_PARTIAL',
    'COMPLETED'
  )
);
