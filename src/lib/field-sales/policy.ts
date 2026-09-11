import type { Role } from '@/lib/roles';

/* ---------------- Field Sales action policy (slice 7) ----------------
   Encodes the ALLOW / APPROVE / DENY matrix for Field Sales geo actions.
     ALLOW   — runs immediately (map, search, GPS on demand, routing).
     APPROVE — runs only after an explicit confirmation by the operator
               (editing a lead's stored address/location).
     DENY    — never runs for that role (deleting a location/point).
   `check_in` is policy-controlled: allowed by role here and additionally
   enforced server-side by the `field_checkin` RPC (is_staff() + geofence). */

export type FieldAction =
  | 'map'
  | 'search'
  | 'gps'
  | 'route'
  | 'check_in'
  | 'edit_address'
  | 'delete_location';

export type FieldGate = 'allow' | 'approve' | 'deny';

type FieldRule = { gate: FieldGate; roles: Role[] };

const FIELD_ROLES: Role[] = ['admin', 'manager', 'field_sales'];

export const FIELD_SALES_POLICY: Record<FieldAction, FieldRule> = {
  map: { gate: 'allow', roles: FIELD_ROLES },
  search: { gate: 'allow', roles: FIELD_ROLES },
  gps: { gate: 'allow', roles: FIELD_ROLES },
  route: { gate: 'allow', roles: FIELD_ROLES },
  check_in: { gate: 'allow', roles: FIELD_ROLES },
  edit_address: { gate: 'approve', roles: FIELD_ROLES },
  delete_location: { gate: 'deny', roles: [] },
};

export type FieldDecision = { allowed: boolean; gate: FieldGate };

export function fieldDecision(role: Role | null | undefined, action: FieldAction): FieldDecision {
  const rule = FIELD_SALES_POLICY[action];
  if (!rule || rule.gate === 'deny' || !role || !rule.roles.includes(role)) {
    return { allowed: false, gate: rule?.gate ?? 'deny' };
  }
  return { allowed: true, gate: rule.gate };
}

export function fieldAllowed(role: Role | null | undefined, action: FieldAction): boolean {
  return fieldDecision(role, action).allowed;
}

export function needsApproval(role: Role | null | undefined, action: FieldAction): boolean {
  const d = fieldDecision(role, action);
  return d.allowed && d.gate === 'approve';
}

export const FIELD_ACTION_LABEL: Record<FieldAction, string> = {
  map: 'Χάρτης',
  search: 'Αναζήτηση',
  gps: 'GPS',
  route: 'Δρομολόγηση',
  check_in: 'Check In',
  edit_address: 'Επεξεργασία Τοποθεσίας',
  delete_location: 'Διαγραφή Τοποθεσίας',
};