-- Migration: Fix requests table status check constraint
-- ===================================================
-- Issue: Database constraint "requests_status_check" was missing PENDING_MEDICAL and MEDICAL_REJECTED
-- Error Symptom: "Action failed — new row for relation 'requests' violates check constraint"
-- Root Cause: HR approval was trying to set status to 'PENDING_MEDICAL' which wasn't in the constraint
--
-- Complete Workflow Flow:
-- 1. Created (request submitted)
-- 2. Doctor stage → PENDING_DOCTOR → DOCTOR_REJECTED or PENDING_HR
-- 3. HR stage → PENDING_HR/PENDING_HR_PARTIAL → HR_RESTRICTED (if quota exceeded) or PENDING_MEDICAL (NEW)
-- 4. Medical Services stage → PENDING_MEDICAL → MEDICAL_REJECTED or PENDING_PATHOLOGY (NEW)
-- 5. Pathology stage → PENDING_PATHOLOGY → PATH_PARTIAL or COMPLETED
-- 6. Done state → COMPLETED

-- Fix: Drop old constraint and add updated one with medical statuses included
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
    'PENDING_MEDICAL',        -- NEW: Medical Services awaiting approval
    'MEDICAL_REJECTED',       -- NEW: Medical Services rejected the request
    'PENDING_PATHOLOGY',
    'PATH_PARTIAL',
    'COMPLETED'
  )
);
