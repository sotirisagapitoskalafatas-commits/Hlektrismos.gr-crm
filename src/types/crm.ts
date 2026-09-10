import type { OrgRole } from '@/lib/roles';

export type AvailabilityStatus = 'available' | 'busy' | 'offline';

export type Organization = {
  id: string;
  name: string;
  slug: string;
  tax_id: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  is_active: boolean;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type Department = {
  id: string;
  organization_id: string | null;
  division_id: string | null;
  name: string;
  code: string;
  head_user_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type Team = {
  id: string;
  organization_id: string | null;
  department_id: string | null;
  name: string;
  code: string | null;
  lead_user_id: string | null;
  territory_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type Territory = {
  id: string;
  organization_id: string | null;
  name: string;
  external_code: string | null;
  geometry: Record<string, unknown> | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type UserRole = {
  role_id: string;
  organization_id: string;
  is_primary: boolean;
  granted_at?: string | null;
  roles?: {
    key: OrgRole;
    name: string | null;
  } | null;
};

export type Profile = {
  id: string;
  full_name: string;
  role: string;
  phone: string | null;
  avatar_url: string | null;
  organization_id: string | null;
  department_id: string | null;
  team_id: string | null;
  territory_id: string | null;
  manager_id: string | null;
  job_title: string | null;
  timezone: string;
  language: string;
  availability_status: AvailabilityStatus;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
  organizations?: Organization | null;
  departments?: Department | null;
  teams?: Team | null;
  territories?: Territory | null;
};