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
    // We use the SERVICE_ROLE key here because this is a backend worker that needs to 
    // bypass RLS to read all leads and update agent stats globally.
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 1. Fetch new leads that haven't been contacted yet
    const { data: leads, error: leadsError } = await supabaseAdmin
      .from('powerfor_leads')
      .select('*')
      .eq('status', 'new')
      .limit(10); // Process in batches of 10

    if (leadsError) throw leadsError;
    if (!leads || leads.length === 0) {
      return new Response(JSON.stringify({ message: "No new leads to process." }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    // 2. Fetch active agents
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

    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiApiKey) throw new Error("GEMINI_API_KEY is not set.");

    const results = [];

    // 3. Process each lead
    for (const lead of leads) {
      // Find an appropriate agent (match region or pick first active fallback)
      let agent = agents.find(a => a.target_region === lead.region);
      if (!agent) agent = agents[0]; // Fallback to the first active agent

      const systemPrompt = `Είσαι ο ${agent.name}, ένας εξειδικευμένος σύμβουλος της PowerFor.
Κανάλι Επικοινωνίας: ${agent.channel} (Γράψε το μήνυμα ώστε να ταιριάζει σε ${agent.channel}).
Οδηγίες: ${agent.base_prompt || 'Γράψε ένα φιλικό μήνυμα για να κλείσεις ένα ραντεβού σχετικά με το ρεύμα/αέριο.'}`;

      const userPrompt = `Στοιχεία Lead:
Όνομα: ${lead.first_name} ${lead.last_name}
Ενδιαφέρον: ${lead.provider}
Τύπος Πελάτη: ${lead.customer_type}
Σχόλια: ${lead.comments || 'Κανένα'}

Γράψε το πρώτο μήνυμα (outbound) που θα στείλεις σε αυτό το lead.`;

      // Call Gemini API to generate the message
      const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${geminiApiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: { text: systemPrompt } },
          contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        }),
      });

      const aiData = await geminiResponse.json();
      const generatedMessage = aiData.candidates?.[0]?.content?.parts?.[0]?.text || "Hello";

      // 4. Update the lead status
      await supabaseAdmin
        .from('powerfor_leads')
        .update({ status: 'contacted', pipeline_status: 'contacted' })
        .eq('id', lead.id);

      // 5. Update the agent's stats
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
