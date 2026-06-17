# Supabase Migration Guide - Medical Services Implementation

## 🚨 CRITICAL: Two Database Constraints Need Fixing

The Medical Services role implementation requires two database constraint updates in Supabase. **Both must be executed** for the workflow to work properly.

---

## Migration 1: Fix `requests` Table Status Constraint

**File**: `migrations/fix_status_check_constraint.sql`

**Issue**: When HR approves a request, it tries to set status to `PENDING_MEDICAL`, but the constraint doesn't allow it.

**Error**: `violates check constraint "requests_status_check"`

### Execute in Supabase:

1. Go to: **SQL Editor → New Query**
2. Copy and paste:

```sql
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
    'PATH_PARTIAL',
    'COMPLETED'
  )
);
```

3. Click **Execute**

---

## Migration 2: Fix `request_timeline` Table Stage Constraint

**File**: `migrations/fix_timeline_stage_constraint.sql`

**Issue**: When Medical Services approves/rejects, it creates a timeline event with stage `MEDICAL_APPROVED` or `MEDICAL_REJECTED`, but the constraint doesn't allow these stages.

**Error**: `violates check constraint "request_timeline_stage_check"`

### Execute in Supabase:

1. Go to: **SQL Editor → New Query**
2. Copy and paste:

```sql
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
    'PATH_PARTIAL',
    'COMPLETED'
  )
);
```

3. Click **Execute**

---

## ✅ Execution Checklist

- [ ] **Migration 1 (requests constraint)** - Executed in Supabase
- [ ] **Migration 2 (request_timeline constraint)** - Executed in Supabase
- [ ] Both show success (no error message)
- [ ] Refresh the PathLab Pro application (Ctrl+Shift+R)
- [ ] Run full workflow test (see WORKFLOW_GUIDE.md)

---

## Expected Behavior After Fixes

### When HR Approves:
- Status changes from `PENDING_HR` → `PENDING_MEDICAL` ✅
- Timeline logs event with stage `HR_APPROVED` ✅
- Request moves to Medical Service Queue ✅

### When Medical Services Approves:
- Status changes from `PENDING_MEDICAL` → `PENDING_PATHOLOGY` ✅
- Timeline logs event with stage `MEDICAL_APPROVED` ✅
- Request moves to Pathology Queue ✅

### When Medical Services Rejects:
- Status changes to `MEDICAL_REJECTED` ✅
- Timeline logs event with stage `MEDICAL_REJECTED` ✅
- Request removed from Medical Service Queue ✅

---

## Troubleshooting

### "Constraint already exists" error
- The constraint might have already been created
- Try adding `IF NOT EXISTS` or just run the DROP and CREATE together (included in SQL above)

### "Cannot find constraint requests_status_check"
- The constraint might have a different name
- Run this query to find all constraints:
```sql
SELECT constraint_name 
FROM information_schema.table_constraints 
WHERE table_name = 'requests' AND constraint_type = 'CHECK';
```

### Still getting "violates check constraint" error after migration
1. Make sure you executed BOTH migrations
2. Hard refresh the app (Ctrl+Shift+R or Cmd+Shift+R)
3. Check Supabase SQL Editor history to confirm both ran successfully
4. Verify the constraint was updated by running:
```sql
-- Check requests constraints
SELECT constraint_name FROM information_schema.table_constraints 
WHERE table_name = 'requests' AND constraint_type = 'CHECK';

-- Check request_timeline constraints
SELECT constraint_name FROM information_schema.table_constraints 
WHERE table_name = 'request_timeline' AND constraint_type = 'CHECK';
```

---

## Order of Execution

⚠️ **IMPORTANT**: Execute in this order:

1. **First**: Migration 1 (requests table status constraint)
2. **Second**: Migration 2 (request_timeline table stage constraint)

Both need to be done before testing the workflow.

---

## Database Schema Reference

### Valid Status Values (requests table)
After Migration 1 is applied, these are the only valid values for `requests.status`:

```
PENDING_DOCTOR, DOCTOR_REJECTED,
PENDING_HR, PENDING_HR_PARTIAL, HR_RESTRICTED, PENDING_ADMIN, ADMIN_REJECTED,
PENDING_MEDICAL, MEDICAL_REJECTED,
PENDING_PATHOLOGY, PATH_PARTIAL,
COMPLETED
```

### Valid Stage Values (request_timeline table)
After Migration 2 is applied, these are the only valid values for `request_timeline.stage`:

```
CREATED,
DOCTOR_APPROVED, DOCTOR_PARTIAL_APPROVED, DOCTOR_REJECTED,
HR_APPROVED, HR_RESTRICTED,
ADMIN_APPROVED, ADMIN_REJECTED,
MEDICAL_APPROVED, MEDICAL_REJECTED,
PATH_PARTIAL,
COMPLETED
```

---

## Verification

After both migrations are complete, test that the constraints work:

```sql
-- This should succeed (valid status)
UPDATE requests SET status = 'PENDING_MEDICAL' WHERE id = 'some-request-id' LIMIT 1;

-- This should fail (invalid status)
UPDATE requests SET status = 'INVALID_STATUS' WHERE id = 'some-request-id' LIMIT 1;
-- Error: violates check constraint "requests_status_check"

-- Timeline insert should succeed
INSERT INTO request_timeline (request_id, stage, actor_id, actor_name, actor_role, note)
VALUES ('some-id', 'MEDICAL_APPROVED', 'some-actor', 'Name', 'medical', 'Approved');

-- This should fail
INSERT INTO request_timeline (request_id, stage, actor_id, actor_name, actor_role, note)
VALUES ('some-id', 'INVALID_STAGE', 'some-actor', 'Name', 'medical', 'Test');
-- Error: violates check constraint "request_timeline_stage_check"
```

---

**Status**: Ready to apply
**Project**: PathLab Pro (iczcjxgysatukewxfmzs)
**Last Updated**: June 2026
