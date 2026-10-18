// Staff administration decisions (pure, unit-tested). Mirrors public.staff_admin_can in
// supabase/staged-migrations/phase2/05 + phase4/17 (admin-only) — the database function stays the authority for edits;
// this module decides create/delete in the admin-users edge function, which needs the Auth Admin API.

export const STAFF_ROLES = ["admin", "manager", "inside_sales", "field_sales", "back_office"] as const;
export type StaffRole = typeof STAFF_ROLES[number];
const OPS: StaffRole[] = ["inside_sales", "field_sales", "back_office"];

export const isStaffRole = (r: unknown): r is StaffRole => typeof r === "string" && (STAFF_ROLES as readonly string[]).includes(r);

/** Roles the actor may create or manage. Account provisioning is ADMIN-ONLY (master prompt §2.4): creating users, choosing
 *  or changing a role, resetting a password and disabling an account. Managers and Back Office can see the team but never
 *  change it. Inactive or unknown actors get nothing (deny by default). */
export function manageableRoles(actorRole: string | null | undefined, actorActive: boolean): StaffRole[] {
  if (!actorActive) return [];
  if (actorRole === "admin") return [...STAFF_ROLES];
  return [];
}

export function canManage(actorRole: string | null | undefined, actorActive: boolean, targetRole: string | null, newRole: string | null = null): boolean {
  const allowed = manageableRoles(actorRole, actorActive) as string[];
  const from = targetRole ?? newRole;
  const to = newRole ?? targetRole;
  return !!from && !!to && allowed.includes(from) && allowed.includes(to);
}

/** Decision for «send a password-reset e-mail»: admin only, never for an account that does not exist. */
export function decideReset(f: { actorRole: string | null; actorActive: boolean; targetRole: string | null; targetEmail: string | null }):
  { ok: true } | { ok: false; status: number; error: string } {
  if (!canManage(f.actorRole, f.actorActive, f.targetRole)) return { ok: false, status: 403, error: "Μόνο οι διαχειριστές μπορούν να επαναφέρουν κωδικούς." };
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
