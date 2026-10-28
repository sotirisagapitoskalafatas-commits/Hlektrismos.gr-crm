import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getCaller, json, serviceClient } from "../_shared/authz.ts";

// Input limit (400 when exceeded): bounded paid-API spend.
const MAX_INPUT_CHARS = 8000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Staff-only (audit fix): the public anon key must not be able to trigger this.
  const caller = await getCaller(req, serviceClient());
  if (caller instanceof Response) return caller;

  try {
    const body = await req.json().catch(() => null);
    const input = (body as { input?: unknown } | null)?.input;
    if (typeof input !== "string" || !input) return json(400, { error: "Input text is required" });
    if (input.length > MAX_INPUT_CHARS) return json(400, { error: `Input text must be at most ${MAX_INPUT_CHARS} characters` });

    const openAiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openAiKey) throw new Error("OPENAI_API_KEY not configured");

    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openAiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: input,
        model: "text-embedding-3-small",
      }),
    });

    const data = await response.json();
    if (!data.data?.[0]?.embedding) {
      throw new Error("Failed to generate embedding");
    }

    return new Response(JSON.stringify({ embedding: data.data[0].embedding }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    console.error("generate-embedding error:", error?.message?.slice(0, 60) || "error");
    return new Response(JSON.stringify({ error: "Embedding generation failed" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
