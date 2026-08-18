import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
- Current tables: hlektrismos_leads, ai_agents, lead_sources, market_tariffs, agent_memory, agent_conversations, agent_reports, crm_users

When asked to fix bugs or implement features, provide:
1. Root cause analysis
2. The exact code changes needed
3. Any migration files required
4. Testing instructions`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
        Deno.env.get("SERVICE_ROLE_KEY") ??
        ""
    );

    const { message, conversationId, agentId } = await req.json();

    // Get or create conversation memory
    let memoryContext = "";
    if (agentId) {
      const { data: memories } = await supabase
        .from("agent_memory")
        .select("content, role")
        .eq("agent_id", agentId)
        .order("created_at", { ascending: false })
        .limit(20);

      if (memories && memories.length > 0) {
        memoryContext =
          "\n\n**Previous Context:**\n" +
          memories.map((m) => `${m.role}: ${m.content}`).join("\n");
      }
    }

    // Get agent config for personality/skills
    let agentConfig = null;
    if (agentId) {
      const { data } = await supabase
        .from("ai_agents")
        .select("personality, skills, base_prompt")
        .eq("id", agentId)
        .single();
      agentConfig = data;
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
      const errText = await geminiResponse.text();
      throw new Error(`Gemini API error: ${geminiResponse.status} - ${errText}`);
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
        },
        {
          agent_id: agentId,
          context_id: conversationId || "general",
          role: "assistant",
          content: assistantMessage,
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
    return new Response(
      JSON.stringify({ error: String(error), success: false }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
