import type { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCaller, serviceClient, type Caller } from "../_shared/authz.ts";
import { isOffice } from "../_shared/access.ts";

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
};

// Models this function may call (the only one used in the repo); anything else falls back to the default.
const ALLOWED_MODELS = ["gpt-4o"];
const DEFAULT_MODEL = "gpt-4o";

// Text that goes into a PostgREST .or()/.ilike filter: drop , ( ) % * and backslash (filter syntax / wildcards).
const filterText = (v: unknown, max = 100) =>
  String(v ?? "").replace(/[,()%*\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

const SYSTEM_PROMPT =
  "Είσαι ο AI σύμβουλος της Hlektrismos.gr, μιας ελληνικής εταιρείας ενέργειας. Βοηθάς τους χρήστες με πληροφορίες για leads, τιμολόγια ενέργειας, και τη διαχείριση του CRM. Απαντάς στα ελληνικά.";

const tools = [
  {
    type: "function" as const,
    function: {
      name: "get_pipeline_summary",
      description:
        "Λαμβάνει περίληψη του pipeline: αριθμό leads ανά κατάσταση (status). Δεν απαιτεί παραμέτρους.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_active_tariffs",
      description:
        "Αναζητά ενεργά τιμολόγια ενέργειας. Μπορείς να φιλτράρεις με provider ή customer_type.",
      parameters: {
        type: "object",
        properties: {
          provider: {
            type: "string",
            description: "Το όνομα του προμηθευτή (π.χ. ΔΕΗ, Protergia, ΗΡΩΝ, ZeniΘ, nrg, Volton, Eunice Power)",
          },
          customer_type: {
            type: "string",
            description: "Ο τύπος πελάτη: residential, business, κλπ.",
          },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "search_leads",
      description:
        "Αναζητά leads βάσει ελεύθερου κειμένου. Ψάχνει σε first_name, last_name, email, phone.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Ο όρος αναζήτησης",
          },
        },
        required: ["query"],
      },
    },
  },
];

type ToolResult = { name: string; content: string };

async function executeTool(
  name: string,
  args: Record<string, unknown>,
  supabase: ReturnType<typeof createClient>,
  caller: Caller
): Promise<ToolResult> {
  // Sales callers only ever see the leads assigned to them (hlektrismos_leads.assigned_to = auth user id).
  const ownOnly = !isOffice(caller) && caller.kind === "user" ? caller.id : null;
  try {
    switch (name) {
      case "get_pipeline_summary": {
        let summaryQuery = supabase
          .from("hlektrismos_leads")
          .select("status")
          .is("deleted_at", null);
        if (ownOnly) summaryQuery = summaryQuery.eq("assigned_to", ownOnly);
        const { data, error } = await summaryQuery.order("status");

        if (error) throw error;

        const counts: Record<string, number> = {};
        for (const row of data ?? []) {
          counts[row.status] = (counts[row.status] ?? 0) + 1;
        }

        return {
          name,
          content: JSON.stringify({ pipeline: counts, total: data?.length ?? 0 }),
        };
      }

      case "get_active_tariffs": {
        const { provider, customer_type } = args as {
          provider?: string;
          customer_type?: string;
        };

        const { data, error } = await supabase.rpc('get_active_tariff_prices').limit(20);

        if (error) throw error;

        let filtered = data ?? [];
        if (provider) filtered = filtered.filter((t: any) => t.provider_name?.toLowerCase().includes(provider.toLowerCase()));
        if (customer_type) filtered = filtered.filter((t: any) => t.customer_type === customer_type);

        return {
          name,
          content: JSON.stringify({ tariffs: filtered, count: filtered.length }),
        };
      }

      case "search_leads": {
        const q = filterText((args as { query?: unknown }).query);

        if (!q) {
          return { name, content: JSON.stringify({ error: "Παρακαλώ εισάγετε όρο αναζήτησης" }) };
        }

        let leadQuery = supabase
          .from("hlektrismos_leads")
          .select("*")
          .is("deleted_at", null)
          .or(
            `first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`
          );
        if (ownOnly) leadQuery = leadQuery.eq("assigned_to", ownOnly);
        const { data, error } = await leadQuery.limit(15);

        if (error) throw error;

        return {
          name,
          content: JSON.stringify({ leads: data ?? [], count: data?.length ?? 0 }),
        };
      }

      default:
        return { name, content: JSON.stringify({ error: `Άγνωστο tool: ${name}` }) };
    }
  } catch (err) {
    // Database details stay in the log; the model gets a generic error.
    console.error(JSON.stringify({ event: "ai_orchestrator_tool_error", name, error: (err as { code?: string })?.code ?? "error" }));
    return {
      name,
      content: JSON.stringify({ error: "Tool failed" }),
    };
  }
}

async function callOpenAI(
  apiKey: string,
  model: string,
  messages: unknown[],
  toolsArg: typeof tools | undefined
): Promise<Record<string, unknown>> {
  const body: Record<string, unknown> = {
    model,
    messages,
  };
  if (toolsArg) body.tools = toolsArg;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    await res.body?.cancel().catch(() => {});
    throw new Error(`OpenAI API ${res.status}`);
  }

  return (await res.json()) as Record<string, unknown>;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Staff-only; lead tools below are scoped to this caller (the service role bypasses RLS).
  const supabase = serviceClient();
  const caller = await getCaller(req, supabase);
  if (caller instanceof Response) return caller;

  try {
    // Any `api_key` in the body is ignored: only the server's own key is used.
    const { message, model: reqModel } = (await req.json()) as {
      message: string;
      model?: string;
    };

    if (!message) {
      return new Response(JSON.stringify({ error: "message is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "OpenAI API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const model = reqModel && ALLOWED_MODELS.includes(reqModel) ? reqModel : DEFAULT_MODEL;

    const messages: unknown[] = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: message },
    ];

    let rounds = 0;
    let finalReply = "";

    while (rounds < 6) {
      const response = await callOpenAI(apiKey, model, messages, tools);

      const choice = (response.choices as { message: Record<string, unknown> }[] | undefined)?.[0];
      if (!choice) {
        throw new Error("No response from OpenAI");
      }

      const assistantMsg = choice.message;
      messages.push(assistantMsg);

      const toolCalls = assistantMsg.tool_calls as
        | { id: string; function: { name: string; arguments: string } }[]
        | undefined;

      if (toolCalls && toolCalls.length > 0) {
        for (const tc of toolCalls) {
          let parsedArgs: Record<string, unknown> = {};
          try {
            parsedArgs = JSON.parse(tc.function.arguments);
          } catch {
            // empty args
          }

          const result = await executeTool(tc.function.name, parsedArgs, supabase, caller);

          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: result.content,
          });
        }

        rounds++;
      } else {
        finalReply = (assistantMsg.content as string) ?? "";
        break;
      }
    }

    if (!finalReply && rounds >= 6) {
      const lastMsg = messages[messages.length - 1] as { content?: string };
      finalReply = (lastMsg?.content as string) ?? "Η διαδικασία ολοκληρώθηκε.";
    }

    return new Response(JSON.stringify({ reply: finalReply }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    // Upstream/internal details stay in the log.
    console.error(JSON.stringify({ event: "ai_orchestrator_error", error: err instanceof Error ? err.message.slice(0, 40) : "error" }));
    return new Response(JSON.stringify({ error: "AI request failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
