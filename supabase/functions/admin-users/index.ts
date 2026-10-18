// Staff accounts: create (invite or temporary password), password reset e-mail and permanent delete, via the Supabase Auth Admin API.
// ADMIN-ONLY (master prompt §2.4): managers and back office can see the team but cannot create, change, reset or delete accounts.
// Edits, role changes and (de)activation go through the audited SQL functions staff_update / staff_set_active
// (staged migration phase2/05), so the same matrix is enforced by the database for every path.
//
// Authorization: the caller's JWT is verified and their role/is_active are read from public.profiles — never from
// the request. Matrix: _shared/staff-admin.ts (mirrors public.staff_admin_can). Every create/delete/refusal is
// written to public.staff_admin_audit. Requires verify_jwt (default). Never returns secrets or tokens.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { canManage, decideDelete, decideReset, validateCreate } from "../_shared/staff-admin.ts";

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY") ?? "";
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token || token === serviceKey) return errorResponse("Απαιτείται σύνδεση χρήστη.", 401);
  const { data: { user: caller }, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !caller) return errorResponse("Μη έγκυρη συνεδρία.", 401);
  const { data: actor } = await admin.from("profiles").select("id, role, is_active").eq("id", caller.id).maybeSingle();
  const actorRole = actor?.role ?? null;
  const actorActive = !!actor && actor.is_active !== false;

  const audit = (row: Record<string, unknown>) => admin.from("staff_admin_audit").insert({ actor_id: caller.id, ...row });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return errorResponse("Μη έγκυρο αίτημα.", 400); }

  if (body.action === "create") {
    const v = validateCreate(body);
    if (!v.ok) return errorResponse(v.error, 400);
    const input = v.value;
    if (!canManage(actorRole, actorActive, null, input.role)) {
      await audit({ action: "denied", note: `create ${input.role}`, target_email: input.email });
      return errorResponse("Δεν έχετε δικαίωμα να δημιουργήσετε χρήστη με αυτόν τον ρόλο.", 403);
    }

    const site = Deno.env.get("SITE_URL") ?? "https://hlektrismos.gr";
    const created = input.mode === "invite"
      ? await admin.auth.admin.inviteUserByEmail(input.email, { data: { full_name: input.full_name }, redirectTo: `${site}/#/app` })
      : await admin.auth.admin.createUser({ email: input.email, password: input.password, email_confirm: true, user_metadata: { full_name: input.full_name } });
    if (created.error || !created.data?.user) {
      const msg = created.error?.message ?? "";
      if (/already|registered|exists/i.test(msg)) return errorResponse("Υπάρχει ήδη λογαριασμός με αυτό το email.", 409);
      return errorResponse("Η δημιουργία του λογαριασμού απέτυχε. Ελέγξτε τη ρύθμιση email/Auth.", 502);
    }
    const newId = created.data.user.id;

    // handle_new_user() normally created an inactive inside_sales profile; set the real values (service role).
    const { error: profErr } = await admin.from("profiles").upsert({
      id: newId, full_name: input.full_name, phone: input.phone, role: input.role, is_active: true, updated_at: new Date().toISOString(),
    });
    if (profErr) {
      await admin.auth.admin.deleteUser(newId); // compensation: never leave an orphaned auth account
      return errorResponse("Ο λογαριασμός δεν ολοκληρώθηκε και αναιρέθηκε. Δοκιμάστε ξανά.", 500);
    }
    await audit({ action: "create", target_id: newId, target_email: input.email, after: { full_name: input.full_name, role: input.role, mode: input.mode } });
    return jsonResponse({ ok: true, id: newId, invited: input.mode === "invite" });
  }

  if (body.action === "delete") {
    const targetId = String(body.user_id ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(targetId)) return errorResponse("Μη έγκυρος χρήστης.", 400);
    const { data: target } = await admin.from("profiles").select("id, full_name, role, is_active, phone").eq("id", targetId).maybeSingle();
    if (!target) return errorResponse("Ο χρήστης δεν βρέθηκε.", 404);
    const [{ data: refs, error: refErr }, { data: admins, error: admErr }, { data: authUser }] = await Promise.all([
      admin.rpc("staff_reference_count", { p_id: targetId }),
      admin.rpc("staff_active_admin_count"),
      admin.auth.admin.getUserById(targetId),
    ]);
    if (refErr || admErr) return errorResponse("Δεν ήταν δυνατός ο έλεγχος εξαρτήσεων· η διαγραφή ακυρώθηκε.", 503); // fail closed
    const decision = decideDelete({
      actorId: caller.id, actorRole, actorActive, targetId, targetRole: target.role, targetActive: target.is_active !== false,
      activeAdmins: Number(admins ?? 0), references: Number(refs ?? 0),
    });
    const email = authUser?.user?.email ?? null;
    if (!decision.ok) {
      if (decision.status === 403) await audit({ action: "denied", target_id: targetId, target_email: email, note: `delete ${target.role}` });
      return errorResponse(decision.error, decision.status);
    }
    const { error: delProfErr } = await admin.from("profiles").delete().eq("id", targetId);
    if (delProfErr) return errorResponse("Η διαγραφή απέτυχε (προφίλ). Δεν έγινε καμία αλλαγή.", 500);
    const { error: delAuthErr } = await admin.auth.admin.deleteUser(targetId);
    if (delAuthErr) {
      await admin.from("profiles").insert(target); // compensation
      return errorResponse("Η διαγραφή του λογαριασμού απέτυχε· το προφίλ επαναφέρθηκε.", 500);
    }
    await audit({ action: "delete", target_id: targetId, target_email: email, before: { full_name: target.full_name, role: target.role } });
    return jsonResponse({ ok: true });
  }

  if (body.action === "reset") {
    const targetId = String(body.user_id ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(targetId)) return errorResponse("Μη έγκυρος χρήστης.", 400);
    const { data: target } = await admin.from("profiles").select("id, role").eq("id", targetId).maybeSingle();
    if (!target) return errorResponse("Ο χρήστης δεν βρέθηκε.", 404);
    const { data: authUser } = await admin.auth.admin.getUserById(targetId);
    const email = authUser?.user?.email ?? null;
    const decision = decideReset({ actorRole, actorActive, targetRole: target.role, targetEmail: email });
    if (!decision.ok) {
      if (decision.status === 403) await audit({ action: "denied", target_id: targetId, target_email: email, note: "reset" });
      return errorResponse(decision.error, decision.status);
    }
    // The user receives the recovery e-mail and chooses the password themselves. No link, token or password is ever returned here.
    const site = Deno.env.get("SITE_URL") ?? "https://hlektrismos.gr";
    const { error: resetErr } = await admin.auth.resetPasswordForEmail(email!, { redirectTo: `${site}/#/app` });
    if (resetErr) return errorResponse("Η αποστολή email επαναφοράς απέτυχε. Ελέγξτε τη ρύθμιση email/Auth.", 502);
    await audit({ action: "password_reset", target_id: targetId, target_email: email, note: "recovery e-mail sent" });
    return jsonResponse({ ok: true });
  }

  return errorResponse("Άγνωστη ενέργεια.", 400);
});
