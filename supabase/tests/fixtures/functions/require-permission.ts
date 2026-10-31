// Test-only entry point: requirePermission has no caller in a deployed function yet, so this gives the harness a handler to run it through.
import { requirePermission } from "../../../functions/_shared/guard.ts";

Deno.serve(async (req: Request) => (await requirePermission(req, "prospecting.search")) ?? new Response("allowed"));
