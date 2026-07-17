export type EmpStatus = 'confirmed' | 'non-confirmed';
export type UserRole = 'admin' | 'hr' | 'doctor' | 'pathologist' | 'medical' | 'user';
export type RelationType = 'Self' | 'Spouse' | 'Father' | 'Mother' | 'Son' | 'Daughter';
export type GenderType = 'Male' | 'Female' | 'Other';

export type RequestStatus =
  | 'PENDING_DOCTOR'
  | 'DOCTOR_REJECTED'
  | 'PENDING_HR'
  | 'PENDING_HR_PARTIAL'
  | 'HR_RESTRICTED'
  | 'PENDING_ADMIN'
  | 'ADMIN_REJECTED'
  | 'PENDING_MEDICAL'
  | 'MEDICAL_REJECTED'
  | 'PENDING_PATHOLOGY'
  | 'SAMPLE_COLLECTED'
  | 'PATH_PARTIAL'
  | 'COMPLETED';

export type TimelineStage =
  | 'CREATED'
  | 'DOCTOR_APPROVED'
  | 'DOCTOR_PARTIAL_APPROVED'
  | 'DOCTOR_REJECTED'
  | 'HR_APPROVED'
  | 'HR_RESTRICTED'
  | 'ADMIN_APPROVED'
  | 'ADMIN_REJECTED'
  | 'MEDICAL_APPROVED'
  | 'MEDICAL_REJECTED'
  | 'SAMPLE_COLLECTED'
  | 'PATH_PARTIAL'
  | 'COMPLETED';

export type TestApproval = 'pending' | 'approved' | 'rejected' | 'completed';

export interface Employee {
  id: string;
  emp_code: string;
  name: string;
  designation: string | null;
  department: string | null;
  status: EmpStatus;
  join_date: string | null;
  contact: string | null;
  quota_override: number | null;
  created_at: string;
  updated_at: string;
}

export interface AppUser {
  id: string;
  username: string;
  password_hash?: string;
  name: string;
  role: UserRole;
  email: string | null;
  emp_code: string | null;
  is_active: boolean;
  last_login: string | null;
  created_at: string;
  updated_at: string;
}

export interface SessionUser {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  emp_code: string | null;
}

export interface Dependent {
  id: string;
  emp_code: string;
  name: string;
  relation: RelationType;
  dob: string | null;
  gender: GenderType | null;
  contact: string | null;
  created_at: string;
  updated_at: string;
}

export interface LabTest {
  id: string;
  code: string;
  name: string;
  category: string;
  price: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TestCategory {
  id: string;
  name: string;
  created_at: string;
}

export interface Medicine {
  id: string;
  name: string;
  generic_name: string | null;
  strength: string | null;
  form: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** A medicine prescribed on a request, with its time-of-day schedule. */
export interface RequestMedicine {
  id: string;
  request_id: string;
  medicine_id: string | null;
  medicine_name: string;
  strength: string | null;
  form: string | null;
  t_morning: boolean;
  t_afternoon: boolean;
  t_evening: boolean;
  t_night: boolean;
  instruction: string | null;
  created_at: string;
}

export interface PathRequest {
  id: string;
  req_no: string;
  slip_no: string | null;
  requester_id: string;
  requester_name: string;
  requester_role: UserRole;
  employee_id: string;
  employee_code: string;
  employee_name: string;
  ben_name: string;
  ben_relation: RelationType;
  ben_dob: string | null;
  dependent_id: string | null;
  status: RequestStatus;
  notes: string | null;
  doctor_prescription: string | null;
  assigned_doctor_id: string | null;
  assigned_doctor_name: string | null;
  doctor_name: string | null;
  doctor_at: string | null;
  hr_name: string | null;
  hr_at: string | null;
  admin_name: string | null;
  admin_at: string | null;
  medical_name: string | null;
  medical_at: string | null;
  pathologist_name: string | null;
  pathologist_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RequestSummary extends PathRequest {
  department: string | null;
  designation: string | null;
  total_tests: number;
  approved_tests: number;
  approved_amount: number;
  total_amount: number;
}

export interface RequestTest {
  id: string;
  request_id: string;
  test_id: string;
  approval: TestApproval;
  collected_by_id: string | null;
  collected_by_name: string | null;
  collected_at: string | null;
  created_at: string;
  updated_at: string;
  test: LabTest;
}

export interface TimelineEvent {
  id: string;
  request_id: string;
  stage: TimelineStage;
  actor_id: string | null;
  actor_name: string;
  actor_role: UserRole;
  note: string | null;
  created_at: string;
}

export interface EmployeeQuota {
  id: string;
  emp_code: string;
  name: string;
  department: string | null;
  used: number;
  remaining: number;
  exceeded: boolean;
  limit_value: number;
  is_custom: boolean;
}

export type QueueMode = 'mine' | 'all' | 'doctor' | 'hr' | 'restricted' | 'medical' | 'pathology';
