// Staff administration decisions (pure, unit-tested). TWO-ROLE MODEL:
//   • «Admin / Back Office» = the single shared office login, stored as role `admin`. Only it may create, edit,
//     activate, deactivate, reset or delete Sales Agent accounts.
//   • «Sales Agent» = individual logins, stored as `field_sales` for every new account (the legacy `inside_sales` value
//     is kept for existing rows and is the same group). Sales Agents provision and manage nobody.
//   • `manager` and `back_office` are LEGACY values: never creatable, never assignable, and they have NO account-management
//     rights. An existing legacy row can only be kept, reset or deactivated by the Admin.
// The database (phase6/21 staff_admin_can) enforces the same matrix; this module guards the Auth Admin API actions.

export const STAFF_ROLES = ["admin", "manager", "inside_sales", "field_sales", "back_office"] as const;
export type StaffRole = typeof STAFF_ROLES[number];
const SALES_AGENT_ROLES: StaffRole[] = ["field_sales", "inside_sales"];
const LEGACY_OFFICE_ROLES: StaffRole[] = ["manager", "back_office"];

/** The only role a new account can be given. */
export const CREATEABLE_SALES_ROLES: readonly StaffRole[] = ["field_sales"];

/** inside_sales and field_sales are one effective Sales Agent group. */
export const isSalesAgentRole = (r: unknown): r is StaffRole => typeof r === "string" && SALES_AGENT_ROLES.includes(r as StaffRole);

export const isStaffRole = (r: unknown): r is StaffRole => typeof r === "string" && (STAFF_ROLES as readonly string[]).includes(r);

/** An actor may administer accounts only when they are the ACTIVE `admin` (the shared Admin / Back Office login). */
export const isAccountAdmin = (actorRole: string | null | undefined, actorActive: boolean): boolean => actorActive && actorRole === "admin";

/** Roles the account UI offers when creating or editing a Sales Agent: exactly one. */
export function manageableRoles(actorRole: string | null | undefined, actorActive: boolean): StaffRole[] {
  return isAccountAdmin(actorRole, actorActive) ? [...CREATEABLE_SALES_ROLES] : [];
}

/** Authorization matrix used by the Auth Admin API (mirrored by public.staff_admin_can).
 * Create (targetRole null): newRole must be `field_sales`. Edit a Sales Agent: stays in the Sales Agent group.
 * The Admin can keep/reset/deactivate existing office rows but never create or promote one (no role change). */
export function canManage(actorRole: string | null | undefined, actorActive: boolean, targetRole: string | null, newRole: string | null = null): boolean {
  if (!isAccountAdmin(actorRole, actorActive)) return false;
  if (targetRole == null) return newRole === "field_sales";
  if (isSalesAgentRole(targetRole)) return newRole == null || isSalesAgentRole(newRole);
  if (targetRole === "admin" || LEGACY_OFFICE_ROLES.includes(targetRole as StaffRole)) return newRole == null || newRole === targetRole;
  return false;
}

/** Decision for «send a password-reset e-mail»: only active office accounts may reset permitted targets. */
export function decideReset(f: { actorRole: string | null; actorActive: boolean; targetRole: string | null; targetEmail: string | null }):
  { ok: true } | { ok: false; status: number; error: string } {
  if (!canManage(f.actorRole, f.actorActive, f.targetRole)) return { ok: false, status: 403, error: "Μόνο ο λογαριασμός Admin / Back Office μπορεί να επαναφέρει κωδικούς." };
  if (!f.targetEmail) return { ok: false, status: 404, error: "Ο λογαριασμός δεν έχει email." };
  return { ok: true };
}

export interface CreateInput { email: string; full_name: string; role: StaffRole; phone: string | null; mode: "invite" | "password"; password?: string }

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateCreate(body: Record<string, unknown>): { ok: true; value: CreateInput } | { ok: false; error: string } {
  const email = String(body.email ?? "").trim().toLowerCase();
  const full_name = String(body.full_name ?? "").trim();
  const phone = String(body.phone ?? "").trim() || null;
  const mode = body.mode === "password" ? "password" : "invite";
  if (!EMAIL.test(email) || email.length > 254) return { ok: false, error: "Μη έγκυρο email." };
  if (full_name.length < 2 || full_name.length > 120) return { ok: false, error: "Συμπληρώστε ονοματεπώνυμο (2–120 χαρακτήρες)." };
  if (!isStaffRole(body.role)) return { ok: false, error: "Μη έγκυρος ρόλος." };
  if (phone && !/^[+0-9 ()-]{6,20}$/.test(phone)) return { ok: false, error: "Μη έγκυρο τηλέφωνο." };
  if (mode === "password") {
    const pw = String(body.password ?? "");
    if (pw.length < 12 || !/[A-Za-zΑ-Ωα-ω]/.test(pw) || !/\d/.test(pw)) {
      return { ok: false, error: "Ο προσωρινός κωδικός χρειάζεται τουλάχιστον 12 χαρακτήρες, με γράμματα και αριθμούς." };
    }
    return { ok: true, value: { email, full_name, role: body.role, phone, mode, password: pw } };
  }
  return { ok: true, value: { email, full_name, role: body.role, phone, mode } };
}

export interface DeleteFacts {
  actorId: string; actorRole: string | null; actorActive: boolean;
  targetId: string; targetRole: string | null; targetActive: boolean;
  activeAdmins: number; references: number;
}

/** Permanent deletion is allowed only when nothing in the CRM points at the person; otherwise deactivate. */
export function decideDelete(f: DeleteFacts): { ok: true } | { ok: false; status: number; error: string } {
  if (f.actorId === f.targetId) return { ok: false, status: 403, error: "Δεν μπορείτε να διαγράψετε τον δικό σας λογαριασμό." };
  if (!canManage(f.actorRole, f.actorActive, f.targetRole)) return { ok: false, status: 403, error: "Δεν έχετε δικαίωμα διαχείρισης αυτού του ρόλου." };
  if (f.targetRole === "admin" && f.targetActive && f.activeAdmins <= 1) {
    return { ok: false, status: 409, error: "Ο τελευταίος ενεργός διαχειριστής δεν μπορεί να διαγραφεί." };
  }
  if (f.references > 0) {
    return { ok: false, status: 409, error: `Ο χρήστης συνδέεται με ${f.references} εγγραφές του CRM. Απενεργοποιήστε τον αντί για διαγραφή, ώστε να διατηρηθεί το ιστορικό.` };
  }
  return { ok: true };
}
