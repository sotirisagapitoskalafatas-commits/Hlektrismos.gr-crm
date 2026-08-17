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
    const url = new URL(req.url)
    const isReport = url.searchParams.get('mode') === 'report' || url.pathname.endsWith('/report')

    const body = await req.json()
    const { message, agent_id, context_id, mode, report_type } = body

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const geminiApiKey = Deno.env.get('GEMINI_API_KEY')
    if (!geminiApiKey) throw new Error("GEMINI_API_KEY is not set.")

    // Fetch all active agents
    const { data: agents, error: agentsError } = await supabaseAdmin
      .from('ai_agents')
      .select('*')
      .eq('status', 'active')

    if (agentsError) throw agentsError

    // Fetch live tariffs for RAG context
    const { data: tariffs } = await supabaseAdmin
      .from('market_tariffs')
      .select('*')

    const tariffLines = tariffs?.map((t: any) => `- ${t.resource}: ${t.tariff_name} @ ${t.price_eur} ${t.unit}`).join('\n') || ''

    // Fetch recent agent conversations for inter-agent context
    const { data: recentConversations } = await supabaseAdmin
      .from('agent_conversations')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20)

    const conversationContext = recentConversations?.map((c: any) => 
      `[${c.message_type}] From Agent: ${c.from_agent_id} → To: ${c.to_agent_id || 'Orchestrator'}: ${c.message}`
    ).join('\n') || 'No recent inter-agent conversations.'

    // Fetch agent memory for context
    let memoryContext = ''
    if (context_id) {
      const { data: memory } = await supabaseAdmin
        .from('agent_memory')
        .select('*')
        .eq('context_id', context_id)
        .order('created_at', { ascending: true })
        .limit(30)

      memoryContext = memory?.map((m: any) => `[${m.role}]: ${m.content}`).join('\n') || ''
    }

    const agentList = agents?.map((a: any) => 
      `- ${a.name} (ID: ${a.id}, Channel: ${a.channel}, Region: ${a.target_region || 'All'}, Skills: ${JSON.stringify(a.skills || [])})`
    ).join('\n') || 'No active agents.'

    // ---- REPORT MODE ----
    if (isReport || mode === 'report') {
      const agentStats = agents?.map((a: any) => 
        `Agent: ${a.name}\n  Channel: ${a.channel}\n  Region: ${a.target_region || 'All Greece'}\n  Leads Contacted: ${a.leads_contacted}\n  Replies: ${a.replies}\n  Meetings Booked: ${a.meetings_booked}\n  Conversion Rate: ${a.leads_contacted > 0 ? ((a.meetings_booked / a.leads_contacted) * 100).toFixed(1) : 0}%`
      ).join('\n\n') || 'No agents.'

      const targetAgent = agent_id ? agents?.find((a: any) => a.id === agent_id) : null

      const reportPrompt = (report_type === 'master' || !agent_id)
        ? `Δημιούργησε μια συνολική αναφορά (master report) για όλη την ομάδα AI agents της Hlektrismos.gr.

ΣΤΟΙΧΕΙΑ AGENTS:\n${agentStats}

ΠΡΗΓΟΥΜΕΝΕΣ ΕΠΙΚΟΙΝΩΝΙΕΣ:\n${conversationContext}

ΤΙΜΟΛΟΓΙΑ:\n${tariffLines}

Ζήτημα: Δημιούργησε ένα structured report στα ελληνικά με:
1. Executive Summary
2. Απόδοση κάθε agent (leads, replies, meetings, conversion)
3. Συμβουλές βελτίωσης
4. Προτάσεις επόμενων βημάτων`
        : `Δημιούργησε αναφορά για τον agent: ${targetAgent?.name || 'Άγνωστος'}
\nChannel: ${targetAgent?.channel}\nRegion: ${targetAgent?.target_region || 'All Greece'}
Leads: ${targetAgent?.leads_contacted} | Replies: ${targetAgent?.replies} | Meetings: ${targetAgent?.meetings_booked}

Ζήτημα: Δημιούργησε αναφορά στα ελληνικά με απόδοση, αναλυτικά στοιχεία και συμβουλές.`

      const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${geminiApiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: { text: 'Είσαι ο report generator της Hlektrismos.gr. Δημιούργησε αναφορές στα ελληνικά με markdown formatting.' } },
          contents: [{ role: 'user', parts: [{ text: reportPrompt }] }],
        }),
      })

      const aiData = await geminiResponse.json()
      if (!geminiResponse.ok) throw new Error(aiData.error?.message || 'Gemini API error')

      const reportContent = aiData.candidates[0].content.parts[0].text

      const metrics = {
        total_agents: agents?.length || 0,
        total_leads: agents?.reduce((sum: number, a: any) => sum + (a.leads_contacted || 0), 0) || 0,
        total_meetings: agents?.reduce((sum: number, a: any) => sum + (a.meetings_booked || 0), 0) || 0,
      }

      const { data: savedReport } = await supabaseAdmin
        .from('agent_reports')
        .insert({
          agent_id: agent_id || null,
          report_type: report_type || 'on_demand',
          title: report_type === 'master' ? 'Master Orchestrator Report' : `Report: ${targetAgent?.name || 'Agent'}`,
          content: reportContent,
          metrics,
        })
        .select()
        .single()

      return new Response(JSON.stringify({ 
        report: reportContent,
        report_id: savedReport?.id,
        metrics,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    // ---- CHAT MODE ----
    const isMaster = mode === 'chat' || !agent_id
    const targetAgent = agent_id ? agents?.find((a: any) => a.id === agent_id) : null

    const systemPrompt = isMaster
      ? `Είσαι ο Master Orchestrator της Hlektrismos.gr — ένας έξυπνος AI coordinator που διαχειρίζεται μια ομάδα αυτόνομων AI agents.

ΡΟΛΟΣ ΣΟΥ:
- Είσαι ο επικεφαλής της ομάδας. Δέχεσαι ερωτήσεις από τον χρήστη (CRM admin) και τις αναθέτεις στον κατάλληλο agent.
- Μπορείς να επικοινωνείς μεταξύ agents (inter-agent communication).
- Κρατάς μνήμη από προηγούμενες συνομιλίες.
- Παράγεις reports για την απόδοση κάθε agent και για τη συνολική ομάδα.

ΔΙΑΘΕΣΙΜΟΙ AGENTS:\n${agentList}

ΖΩΝΤΑΝΑ ΤΑΡΙΦΑ (RAG):\n${tariffLines}

ΠΡΗΓΟΥΜΕΝΗ ΕΠΙΚΟΙΝΩΝΙΑ AGENTS:\n${conversationContext}

ΜΝΗΜΗ ΣΥΝΟΜΙΛΙΑΣ:\n${memoryContext || '(Δεν υπάρχει προηγούμενη μνήμη)'}

ΟΔΗΓΙΕΣ:
1. Αν ο χρήστης ρωτά για κάποιο συγκεκριμένο agent, απάντα με πληροφορίες για αυτόν.
2. Αν ζητά αναφορά (report), πες του ότι μπορεί να ζητήσει report mode.
3. Αν θέλει να στείλει μήνυμα σε agent, δημιούργησε ένα inter-agent message και αποθήκευσέ το.
4. Αν ρωτά για τιμές, χρησιμοποίησε τα live ταρίφα.
5. Απάντα πάντα στα ελληνικά, επαγγελματικά και σύντομα.`
      : `Είσαι ο ${targetAgent?.name || 'Agent'} της Hlektrismos.gr.
Κανάλι: ${targetAgent?.channel}
Περιοχή: ${targetAgent?.target_region || 'Όλη η Ελλάδα'}
Βάση γνώσης (τιμολόγια):\n${tariffLines}
Μνήμη: ${memoryContext || 'Νέα συνομιλία'}
Οδηγίες: ${targetAgent?.base_prompt || 'Βοήθησε τον χρήστη με ενεργειακές ερωτήσεις.'}
Απάντα στα ελληνικά.`

    // Build conversation history for Gemini
    const geminiMessages = []
    
    if (memoryContext) {
      const memoryLines = memoryContext.split('\n').filter((l: string) => l.trim())
      for (const line of memoryLines.slice(-10)) {
        if (line.startsWith('[user]:')) {
          geminiMessages.push({ role: 'user', parts: [{ text: line.replace('[user]: ', '') }] })
        } else if (line.startsWith('[assistant]:')) {
          geminiMessages.push({ role: 'model', parts: [{ text: line.replace('[assistant]: ', '') }] })
        }
      }
    }
    
    geminiMessages.push({ role: 'user', parts: [{ text: message }] })

    // Call Gemini API
    const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${geminiApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: { text: systemPrompt } },
        contents: geminiMessages,
      }),
    })

    const aiData = await geminiResponse.json()
    if (!geminiResponse.ok) {
      throw new Error(aiData.error?.message || 'Gemini API error')
    }

    const reply = aiData.candidates[0].content.parts[0].text

    // Save to agent_memory
    const memContextId = context_id || crypto.randomUUID()
    const targetAgentId = agent_id || agents?.[0]?.id

    if (targetAgentId) {
      await supabaseAdmin.from('agent_memory').insert([
        { agent_id: targetAgentId, context_id: memContextId, role: 'user', content: message },
        { agent_id: targetAgentId, context_id: memContextId, role: 'assistant', content: reply, metadata: { model: 'gemini-3.6-flash', tokens: aiData.usageMetadata?.totalTokenCount } },
      ])
    }

    return new Response(JSON.stringify({ 
      reply, 
      context_id: memContextId,
      agent_id: targetAgentId,
    }), {
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
