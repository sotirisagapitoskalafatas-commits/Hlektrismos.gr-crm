import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
};

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
            description: "Το όνομα του προμηθευτή (π.χ. PPC, Heron, Elpedison)",
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
  supabase: ReturnType<typeof createClient>
): Promise<ToolResult> {
  try {
    switch (name) {
      case "get_pipeline_summary": {
        const { data, error } = await supabase
          .from("hlektrismos_leads")
          .select("status")
          .order("status");

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

        let query = supabase
          .from("market_tariffs")
          .select("*")
          .eq("is_active", true);

        if (provider) {
          query = query.ilike("provider", `%${provider}%`);
        }
        if (customer_type) {
          query = query.ilike("customer_type", `%${customer_type}%`);
        }

        const { data, error } = await query.limit(20);

        if (error) throw error;

        return {
          name,
          content: JSON.stringify({ tariffs: data ?? [], count: data?.length ?? 0 }),
        };
      }

      case "search_leads": {
        const { query: q } = args as { query: string };

        if (!q) {
          return { name, content: JSON.stringify({ error: "Παρακαλώ εισάγετε όρο αναζήτησης" }) };
        }

        const { data, error } = await supabase
          .from("hlektrismos_leads")
          .select("*")
          .or(
            `first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`
          )
          .limit(15);

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
    return {
      name,
      content: JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
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
    const errText = await res.text();
    throw new Error(`OpenAI API ${res.status}: ${errText}`);
  }

  return (await res.json()) as Record<string, unknown>;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { message, api_key, model: reqModel } = (await req.json()) as {
      message: string;
      api_key?: string;
      model?: string;
    };

    if (!message) {
      return new Response(JSON.stringify({ error: "message is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = api_key || Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "OpenAI API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const model = reqModel || "gpt-4o";

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

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

          const result = await executeTool(tc.function.name, parsedArgs, supabase);

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
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
