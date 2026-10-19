// Staff administration decisions (pure, unit-tested). The staged phase4/20 matrix supersedes phase4/17:
// Admin can administer legacy roles; Back Office can administer Sales Agent accounts only; sales users cannot provision.
// The database function remains authoritative for edits/activation; this module guards Auth Admin API actions.

export const STAFF_ROLES = ["admin", "manager", "inside_sales", "field_sales", "back_office"] as const;
export type StaffRole = typeof STAFF_ROLES[number];
const SALES_AGENT_ROLES: StaffRole[] = ["field_sales", "inside_sales"];

/** New accounts default to Field Sales, the single effective Sales Agent role with map/route access. */
export const CREATEABLE_SALES_ROLES: readonly StaffRole[] = ["field_sales"];

/** Legacy inside_sales / field_sales profiles map to one effective Sales Agent access group. */
export const isSalesAgentRole = (r: unknown): r is StaffRole => typeof r === "string" && SALES_AGENT_ROLES.includes(r as StaffRole);

export const isStaffRole = (r: unknown): r is StaffRole => typeof r === "string" && (STAFF_ROLES as readonly string[]).includes(r);

/** The account UI exposes only the Sales Agent roles as assignable choices for every office account.
 * The legacy admin identity may still manage/deactivate an existing legacy office profile, but cannot create
 * another office account or promote a Sales Agent. Unknown/inactive actors fail closed. */
export function manageableRoles(actorRole: string | null | undefined, actorActive: boolean): StaffRole[] {
  if (!actorActive) return [];
  if (actorRole === "admin" || actorRole === "back_office" || actorRole === "manager") return [...SALES_AGENT_ROLES];
  return [];
}

/** Authorization matrix used by the Auth Admin API and mirrored in staged SQL.
 * Create: only Sales Agent roles. Edit: Sales Agent to Sales Agent only. Existing legacy office rows may
 * retain their role / be reset or deactivated by the legacy admin identity, but cannot be promoted or created. */
export function canManage(actorRole: string | null | undefined, actorActive: boolean, targetRole: string | null, newRole: string | null = null): boolean {
  if (!actorActive || !["admin", "manager", "back_office"].includes(actorRole ?? "")) return false;

  // Account creation: targetRole is absent; assignable roles are always Sales Agent roles.
  if (targetRole == null) return isSalesAgentRole(newRole);

  // The effective office group can manage Sales Agent accounts without granting role elevation.
  if (isSalesAgentRole(targetRole)) return newRole == null || isSalesAgentRole(newRole);

  // Keep legacy office accounts operable for Admin during transition, but not changeable/promotable.
  if (actorRole === "admin" && ["admin", "manager", "back_office"].includes(targetRole)) {
    return newRole == null || newRole === targetRole;
  }
  return false;
}

/** Decision for «send a password-reset e-mail»: only active office accounts may reset permitted targets. */
export function decideReset(f: { actorRole: string | null; actorActive: boolean; targetRole: string | null; targetEmail: string | null }):
  { ok: true } | { ok: false; status: number; error: string } {
  if (!canManage(f.actorRole, f.actorActive, f.targetRole)) return { ok: false, status: 403, error: "Μόνο το Back Office μπορεί να επαναφέρει κωδικούς Sales Agent." };
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
