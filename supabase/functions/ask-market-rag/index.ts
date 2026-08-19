import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const { messages, thread_id } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      throw new Error("A messages array is required.");
    }

    const latestUserMessage = messages[messages.length - 1].content;

    // Check if OpenAI key is available for embeddings + GPT synthesis
    const openAiKey = Deno.env.get("OPENAI_API_KEY");

    if (!openAiKey) {
      // Fallback: Direct Gemini call without vector search
      const geminiKey = Deno.env.get("GEMINI_API_KEY") || Deno.env.get("CRM_AI_AGENT") || "";

      if (!geminiKey) {
        throw new Error("No AI API key configured. Set OPENAI_API_KEY or GEMINI_API_KEY in Supabase secrets.");
      }

      // Fetch all tariffs as context
      const { data: tariffs } = await supabase
        .from("market_tariffs")
        .select("provider_name, program_name, tariff_color, unit_rate_kwh, fixed_fee_monthly, validity_month")
        .order("validity_month", { ascending: false })
        .limit(50);

      const tariffContext = tariffs?.map((t: any) =>
        `- ${t.provider_name} | ${t.program_name} | ${t.tariff_color?.toUpperCase() || 'B2B'} | ${t.unit_rate_kwh} €/kWh | €${t.fixed_fee_monthly}/mo | ${t.validity_month}`
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
      if (!geminiRes.ok) throw new Error(geminiData.error?.message || "Gemini API error");
      const answer = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "Δεν μπόρεσα να δημιουργήσω απάντηση.";

      // Persist to chat_threads and chat_messages if thread_id provided
      if (thread_id) {
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
    if (thread_id) {
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
    console.error("ask-market-rag error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
