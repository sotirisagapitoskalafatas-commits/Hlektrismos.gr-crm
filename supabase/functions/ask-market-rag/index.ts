import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getCaller, json, serviceClient } from "../_shared/authz.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabase = serviceClient();

// Input limits (400 when exceeded): bounded prompt size / paid-API spend.
const MAX_MESSAGES = 30;
const MAX_CONTENT_CHARS = 4000;
const ROLES = ["user", "assistant"];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Staff-only (audit fix): the public anon key must not be able to trigger this.
  const caller = await getCaller(req, supabase);
  if (caller instanceof Response) return caller;

  try {
    const body = await req.json().catch(() => null);
    const { messages, thread_id } = (body ?? {}) as { messages?: unknown; thread_id?: unknown };

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return json(400, { error: "A messages array is required." });
    }
    if (messages.length > MAX_MESSAGES) {
      return json(400, { error: `At most ${MAX_MESSAGES} messages are allowed.` });
    }
    for (const m of messages) {
      if (!m || typeof m !== "object" || !ROLES.includes(m.role) || typeof m.content !== "string" || m.content.length > MAX_CONTENT_CHARS) {
        return json(400, { error: `Each message needs role user|assistant and text content of at most ${MAX_CONTENT_CHARS} characters.` });
      }
    }

    const latestUserMessage = messages[messages.length - 1].content;

    // Persist only into the caller's own thread (chat_threads.user_id); the service role is trusted.
    let ownsThread = false;
    if (typeof thread_id === "string" && thread_id) {
      if (caller.kind === "service") {
        ownsThread = true;
      } else {
        const { data: thread } = await supabase.from("chat_threads").select("user_id").eq("id", thread_id).maybeSingle();
        ownsThread = !!thread && thread.user_id === caller.id;
      }
    }

    // Check if OpenAI key is available for embeddings + GPT synthesis
    const openAiKey = Deno.env.get("OPENAI_API_KEY");

    if (!openAiKey) {
      // Fallback: Direct Gemini call without vector search
      const geminiKey = Deno.env.get("GEMINI_API_KEY") || Deno.env.get("CRM_AI_AGENT") || "";

      if (!geminiKey) {
        throw new Error("No AI API key configured");
      }

      // Fetch all tariffs as context
      const { data: tariffs } = await supabase.rpc('get_active_tariff_prices');

      const tariffContext = tariffs?.map((t: any) =>
        `- ${t.provider_name} | ${t.program_name} | ${t.tariff_color?.toUpperCase() || 'B2B'} | ${t.unit_rate_kwh} €/kWh | €${t.fixed_fee_monthly}/mo | ${t.validity_from}`
      ).join("\n") || "Δεν υπάρχουν τρέχοντα ταρίφα.";

      // Call Gemini for synthesis
      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-goog-api-key": geminiKey,
          },
          body: JSON.stringify({
            system_instruction: {
              parts: [{
                text: `Είσαι ειδικός σύμβουλος ενέργειας για την ελληνική αγορά ρεύματος. Απάντα χρησιμοποιώντας ΜΟΝΟ τα παρεχόμενα δεδομένα τιμολογίων. Αν δεν υπάρχουν αρκετές πληροφορίες, πες το. Πάντα στα ελληνικά.`
              }]
            },
            contents: [{
              role: "user",
              parts: [{
                text: `ΤΡΕΧΟΝΤΑ ΤΑΡΙΦΑ ΕΛΛΗΝΙΚΗΣ ΑΓΟΡΑΣ:\n${tariffContext}\n\nΕΡΩΤΗΣΗ ΧΡΗΣΤΗ:\n${latestUserMessage}`
              }]
            }],
            temperature: 0.2,
          }),
          signal: AbortSignal.timeout(30000),
        }
      );

      const geminiData = await geminiRes.json();
      if (!geminiRes.ok) throw new Error(`Gemini API error ${geminiRes.status}`);
      const answer = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "Δεν μπόρεσα να δημιουργήσω απάντηση.";

      // Persist to chat_threads and chat_messages if thread_id provided
      if (ownsThread) {
        try {
          await supabase.from("chat_messages").insert([
            { thread_id, role: "user", content: latestUserMessage },
            { thread_id, role: "assistant", content: answer, sources: tariffs?.slice(0, 5) || [] },
          ]);
          await supabase.from("chat_threads").update({ updated_at: new Date().toISOString() }).eq("id", thread_id);
        } catch { /* non-critical */ }
      }

      return new Response(JSON.stringify({ answer, sources: tariffs?.slice(0, 5) || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Full RAG pipeline with OpenAI embeddings + GPT-4o
    const embedRes = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openAiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: latestUserMessage,
        model: "text-embedding-3-small",
      }),
    });
    const embedData = await embedRes.json();
    const queryEmbedding = embedData.data?.[0]?.embedding;

    // Query pgvector for matching tariffs
    let matchedTariffs: any[] = [];
    if (queryEmbedding) {
      const { data } = await supabase.rpc("match_tariffs", {
        query_embedding: queryEmbedding,
        match_threshold: 0.3,
        match_count: 5,
      });
      matchedTariffs = data || [];
    }

    // Build context
    const contextString = matchedTariffs
      .map((t: any) =>
        `- ${t.provider_name} | ${t.program_name} | ${(t.tariff_color || 'B2B').toUpperCase()} | ${t.unit_rate_kwh} €/kWh | €${t.fixed_fee_monthly}/mo | ${t.validity_month}`
      ).join("\n") || "Δεν βρέθηκαν ταρίφα για αυτή την ερώτηση.";

    // GPT-4o synthesis
    const chatRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openAiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `Είσαι ειδικός σύμβουλος ενέργειας για την ελληνική αγορά ρεύματος. Απάντα χρησιμοποιώντας ΜΟΝΟ τα παρεχόμενα δεδομένα τιμολογίων. Αν δεν υπάρχουν αρκετές πληροφορίες, πες το. Πάντα στα ελληνικά.\n\nΤΡΕΧΟΝΤΑ ΔΕΔΟΜΕΝΑ:\n${contextString}`
          },
          ...messages.map((m: any) => ({ role: m.role, content: m.content })),
        ],
        temperature: 0.2,
      }),
    });

    const chatData = await chatRes.json();
    const answer = chatData.choices?.[0]?.message?.content || "Δεν μπόρεσα να δημιουργήσω απάντηση.";

    // Persist to chat_threads and chat_messages
    if (ownsThread) {
      try {
        await supabase.from("chat_messages").insert([
          { thread_id, role: "user", content: latestUserMessage },
          { thread_id, role: "assistant", content: answer, sources: matchedTariffs },
        ]);
        await supabase.from("chat_threads").update({ updated_at: new Date().toISOString() }).eq("id", thread_id);
      } catch { /* non-critical */ }
    }

    return new Response(JSON.stringify({ answer, sources: matchedTariffs }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error: any) {
    console.error("ask-market-rag error:", error?.message?.slice(0, 60) || "error");
    return new Response(JSON.stringify({ error: "Market search failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
