import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: any) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Kill switch check
    const { data: globalSettings } = await supabaseAdmin
      .from('crm_settings')
      .select('setting_value')
      .eq('setting_key', 'GLOBAL_AI_PAUSED')
      .single();
    if (globalSettings?.setting_value === true || globalSettings?.setting_value === 'true') {
      return new Response(JSON.stringify({ message: "AI globally paused via kill switch." }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
      });
    }

    // 1. Fetch new leads that haven't been contacted yet (exclude soft-deleted, exclude ai_paused)
    const { data: leads, error: leadsError } = await supabaseAdmin
      .from('hlektrismos_leads')
      .select('*')
      .eq('status', 'new')
      .is('deleted_at', null)
      .eq('ai_paused', false)
      .limit(10);

    if (leadsError) throw leadsError;
    if (!leads || leads.length === 0) {
      return new Response(JSON.stringify({ message: "No new leads to process." }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    // 2. Fetch active agents with skills
    const { data: agents, error: agentsError } = await supabaseAdmin
      .from('ai_agents')
      .select('*')
      .eq('status', 'active');

    if (agentsError) throw agentsError;
    if (!agents || agents.length === 0) {
      return new Response(JSON.stringify({ message: "No active agents available." }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    const geminiApiKey = Deno.env.get('GEMINI_API_KEY') || Deno.env.get('CRM_AI_AGENT') || Deno.env.get('CRM_AI_AGENT_2') || agents[0]?.custom_api_key;
    if (!geminiApiKey) throw new Error("No GEMINI_API_KEY available.");

    // 3. Fetch tariffs for RAG
    const { data: tariffs } = await supabaseAdmin
      .from('market_tariffs')
      .select('*')

    const tariffLines = tariffs?.map((t: any) => `- ${t.resource}: ${t.tariff_name} @ ${t.price_eur} ${t.unit}`).join('\n') || ''

    const results = [];

    // 4. Process each lead
    for (const lead of leads) {
      // Find an appropriate agent (match region or pick first active fallback)
      let agent = agents.find((a: any) => a.target_region === lead.region);
      if (!agent) agent = agents[0];

      // Load agent memory for context
      const { data: memory } = await supabaseAdmin
        .from('agent_memory')
        .select('role, content')
        .eq('agent_id', agent.id)
        .order('created_at', { ascending: false })
        .limit(10)

      const memoryContext = memory?.reverse().map((m: any) => `[${m.role}]: ${m.content}`).join('\n') || ''

      // Build skills description
      const skillsDesc = agent.skills?.length > 0
        ? `\nΔεξιότητες: ${agent.skills.map((s: any) => s.name || s).join(', ')}`
        : ''

      const personalityDesc = agent.personality ? `\nΠροσωπικότητα: ${agent.personality}` : ''

      const systemPrompt = `Είσαι ο ${agent.name}, ένας εξειδικευμένος σύμβουλος της Hlektrismos.gr.
Κανάλι Επικοινωνίας: ${agent.channel} (Γράψε το μήνυμα ώστε να ταιριάζει σε ${agent.channel}).
Οδηγίες: ${agent.base_prompt || 'Γράψε ένα φιλικό μήνυμα για να κλείσεις ένα ραντεβού σχετικά με το ρεύμα/αέριο.'}
${skillsDesc}${personalityDesc}

ΖΩΝΤΑΝΑ ΤΑΡΙΦΑ:
${tariffLines}

ΠΡΗΓΟΥΜΕΝΗ ΜΝΗΜΗ:
${memoryContext}

ΣΗΜΕΙΩΣΗ: Αυτό το μήνυμα θα σταλεί μέσω ${agent.channel}. Γράψε ανάλογα.`;

      const userPrompt = `Στοιχεία Lead:
Όνομα: ${lead.first_name} ${lead.last_name}
Email: ${lead.email}
Τηλέφωνο: ${lead.phone}
Ενδιαφέρον: ${lead.provider}
Τύπος Πελάτη: ${lead.customer_type}
Περιοχή: ${lead.region}
Σχόλια: ${lead.comments || 'Κανένα'}

Γράψε το πρώτο μήνυμα (outbound) που θα στείλεις σε αυτό το lead.`;

      // Call Gemini API (use agent's custom key if available)
      const apiKey = agent.custom_api_key || geminiApiKey;
      const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        }),
        signal: AbortSignal.timeout(60000),
      });

      const aiData = await geminiResponse.json();
      const generatedMessage = aiData.candidates?.[0]?.content?.parts?.[0]?.text || "Hello";

      // Save to agent_memory
      const contextId = `lead-${lead.id}-agent-${agent.id}`;
      await supabaseAdmin.from('agent_memory').insert([
        { agent_id: agent.id, context_id: contextId, role: 'user', content: userPrompt },
        { agent_id: agent.id, context_id: contextId, role: 'assistant', content: generatedMessage, metadata: { model: 'gemini-3.6-flash', lead_id: lead.id } },
      ]);

      // Update the lead status
      await supabaseAdmin
        .from('hlektrismos_leads')
        .update({ status: 'contacted', pipeline_status: 'contacted' })
        .eq('id', lead.id);

      // Update the agent's stats
      await supabaseAdmin
        .from('ai_agents')
        .update({ leads_contacted: agent.leads_contacted + 1 })
        .eq('id', agent.id);

      results.push({
        lead: `${lead.first_name} ${lead.last_name}`,
        agent: agent.name,
        channel: agent.channel,
        message_preview: generatedMessage.substring(0, 100) + '...'
      });
    }

    return new Response(JSON.stringify({ message: `Processed ${results.length} leads.`, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
