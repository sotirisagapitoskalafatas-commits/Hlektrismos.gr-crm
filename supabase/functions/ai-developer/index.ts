import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { getCaller, json, serviceClient } from "../_shared/authz.ts";
import { isOffice } from "../_shared/access.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

// Developer agent system prompt with skills and memory
const DEVELOPER_SYSTEM_PROMPT = `You are a senior software engineer and IT specialist working for Hlektrismos.gr, a Greek energy company CRM platform. You have expertise in:

**Technical Skills:**
- React, TypeScript, Vite frontend development
- Supabase (PostgreSQL, Edge Functions, Auth, Storage, RLS)
- Deno runtime for Edge Functions
- CSS/HTML responsive design
- REST APIs and webhooks
- Database design and migrations

**Your Capabilities:**
1. **Code Review**: Analyze code for bugs, security issues, performance problems
2. **Bug Fixing**: Identify and fix bugs in React, TypeScript, Supabase
3. **Feature Implementation**: Write new components, pages, functions
4. **Database Management**: Create migrations, optimize queries, fix RLS policies
5. **Architecture**: Design system architecture, recommend patterns
6. **DevOps**: Deployment, CI/CD, environment configuration

**Working Style:**
- Always respond in Greek when the user writes in Greek
- Provide code examples with proper formatting
- Explain changes clearly before and after
- Follow existing code patterns in the project
- Consider GDPR compliance for any data handling
- Test changes mentally before suggesting them

**Project Context:**
- Platform: React + Vite + TypeScript frontend, Supabase backend
- Database: PostgreSQL with RLS policies
- Edge Functions: Deno runtime
- Auth: Supabase Auth with email/password
- Current tables: hlektrismos_leads, hlektrismos_customers, ai_agents, lead_sources, energy_tariffs, energy_tariff_prices, agent_memory, agent_conversations, agent_reports, crm_users

When asked to fix bugs or implement features, provide:
1. Root cause analysis
2. The exact code changes needed
3. Any migration files required
4. Testing instructions`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Staff-only; memory is private to the caller (the service role bypasses RLS).
  const supabase = serviceClient();
  const caller = await getCaller(req, supabase);
  if (caller instanceof Response) return caller;
  const ownerId = caller.kind === "user" ? caller.id : null;

  try {
    const body = await req.json().catch(() => null);
    const { message, conversationId, agentId } = (body ?? {}) as {
      message?: unknown; conversationId?: string; agentId?: string;
    };
    if (typeof message !== "string" || !message.trim() || message.length > 20000) {
      return json(400, { error: "message is required (max 20000 characters)", success: false });
    }

    // Get agent config for personality/skills — the agent must be the caller's own (office: any).
    let agentConfig: { personality?: string; skills?: unknown; base_prompt?: string } | null = null;
    if (agentId) {
      const { data } = await supabase
        .from("ai_agents")
        .select("user_id, personality, skills, base_prompt")
        .eq("id", agentId)
        .maybeSingle();
      if (!data) return json(404, { error: "Record not found", success: false });
      if (!isOffice(caller) && data.user_id !== ownerId) return json(403, { error: "Not your record", success: false });
      agentConfig = data;
    }

    // Get or create conversation memory — only the caller's own rows
    let memoryContext = "";
    if (agentId) {
      let memoryQuery = supabase
        .from("agent_memory")
        .select("content, role")
        .eq("agent_id", agentId);
      if (ownerId) memoryQuery = memoryQuery.eq("metadata->>owner_user_id", ownerId);
      const { data: memories } = await memoryQuery
        .order("created_at", { ascending: false })
        .limit(20);

      if (memories && memories.length > 0) {
        memoryContext =
          "\n\n**Previous Context:**\n" +
          memories.map((m) => `${m.role}: ${m.content}`).join("\n");
      }
    }

    // Build messages for Gemini
    const systemPrompt =
      DEVELOPER_SYSTEM_PROMPT +
      memoryContext +
      (agentConfig?.personality
        ? `\n\n**Agent Personality:** ${agentConfig.personality}`
        : "") +
      (agentConfig?.base_prompt
        ? `\n\n**Custom Instructions:** ${agentConfig.base_prompt}`
        : "");

    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: message },
    ];

    // Call Gemini API (auth keys use X-goog-api-key header)
    const geminiApiKey =
      Deno.env.get("GEMINI_API_KEY") ||
      Deno.env.get("CRM_AI_AGENT") ||
      Deno.env.get("CRM_AI_AGENT_2") ||
      "";

    if (!geminiApiKey) {
      throw new Error("No Gemini API key available");
    }

    const geminiContents = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));

    const systemInstruction = messages.find((m) => m.role === "system");

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-goog-api-key": geminiApiKey,
        },
        body: JSON.stringify({
          contents: geminiContents,
          systemInstruction: systemInstruction
            ? { parts: [{ text: systemInstruction.content }] }
            : undefined,
          generationConfig: {
            temperature: 0.7,
            topP: 0.9,
            maxOutputTokens: 8192,
          },
        }),
        signal: AbortSignal.timeout(60000),
      }
    );

    if (!geminiResponse.ok) {
      // The upstream error body stays out of the response (and the log).
      await geminiResponse.body?.cancel().catch(() => {});
      throw new Error(`Gemini API error: ${geminiResponse.status}`);
    }

    const geminiData = await geminiResponse.json();
    const assistantMessage =
      geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "Δεν ήταν δυνατή η δημιουργία απάντησης.";

    // Store in memory
    if (agentId) {
      await supabase.from("agent_memory").insert([
        {
          agent_id: agentId,
          context_id: conversationId || "general",
          role: "user",
          content: message,
          metadata: { owner_user_id: ownerId },
        },
        {
          agent_id: agentId,
          context_id: conversationId || "general",
          role: "assistant",
          content: assistantMessage,
          metadata: { owner_user_id: ownerId },
        },
      ]);
    }

    // Store conversation
    if (conversationId) {
      await supabase.from("agent_conversations").insert({
        from_agent_id: agentId || "00000000-0000-0000-0000-000000000000",
        message: `User: ${message}\n\nAssistant: ${assistantMessage}`,
        message_type: "chat",
        context_id: conversationId,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: assistantMessage,
        conversationId,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error(JSON.stringify({ event: "ai_developer_error", error: error instanceof Error ? error.message.slice(0, 40) : "error" }));
    return new Response(
      JSON.stringify({ error: "AI request failed", success: false }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
