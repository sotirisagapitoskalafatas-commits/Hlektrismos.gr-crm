import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Available Gemini models (user-configurable)
const VALID_MODELS = [
  'gemini-3.6-flash',
  'gemini-3.6-pro',
  'gemini-2.5-flash',
  'gemini-2.5-pro',
  'gemini-2.0-flash',
  'gemini-1.5-flash',
  'gemini-1.5-pro',
]
const DEFAULT_MODEL = 'gemini-3.6-flash'

serve(async (req: any) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const isReport = url.searchParams.get('mode') === 'report' || url.pathname.endsWith('/report')

    const body = await req.json()
    const { message, agent_id, context_id, mode, report_type, multi_agent, agent_ids } = body

    // User-provided API key (from Agent Hub settings) or fallback to backend secret
    const userApiKey = body.api_key || ''
    const userModel = body.model || ''
    const geminiApiKey = userApiKey || Deno.env.get('GEMINI_API_KEY') || Deno.env.get('CRM_AI_AGENT') || Deno.env.get('CRM_AI_AGENT_2') || ''
    if (!geminiApiKey) throw new Error("No Gemini API key available. Please configure your API key in Agent Hub settings (⚙️).")

    // Validate and resolve model name
    const geminiModel = (userModel && VALID_MODELS.includes(userModel)) ? userModel : DEFAULT_MODEL

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Fetch all active agents (with soft-delete filter)
    const { data: agents, error: agentsError } = await supabaseAdmin
      .from('ai_agents')
      .select('*')
      .eq('status', 'active')
      .is('deleted_at', null)

    if (agentsError) throw agentsError

    // Fetch live tariffs for RAG context
    const { data: tariffs } = await supabaseAdmin
      .from('market_tariffs')
      .select('*')

    const tariffLines = tariffs?.map((t: any) => `- ${t.resource}: ${t.tariff_name} @ ${t.price_eur} ${t.unit}`).join('\n') || ''

    // Fetch recent agent conversations for inter-agent context (handle missing table gracefully)
    let conversationContext = 'No recent inter-agent conversations.'
    try {
      const { data: recentConversations, error: convError } = await supabaseAdmin
        .from('agent_conversations')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20)

      if (!convError && recentConversations && recentConversations.length > 0) {
        conversationContext = recentConversations.map((c: any) =>
          `[${c.message_type}] From Agent: ${c.from_agent_id} → To: ${c.to_agent_id || 'Orchestrator'}: ${c.message}`
        ).join('\n')
      }
    } catch {
      // agent_conversations table may not exist — continue without it
    }

    // Fetch agent memory for context (filter out null context_ids)
    let memoryContext = ''
    if (context_id && context_id !== 'null' && context_id !== 'undefined') {
      const { data: memory } = await supabaseAdmin
        .from('agent_memory')
        .select('*')
        .eq('context_id', context_id)
        .not('context_id', 'is', null)
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

      const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-goog-api-key': geminiApiKey,
        },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: 'Είσαι ο report generator της Hlektrismos.gr. Δημιούργησε αναφορές στα ελληνικά με markdown formatting.' }] },
          contents: [{ role: 'user', parts: [{ text: reportPrompt }] }],
        }),
        signal: AbortSignal.timeout(60000),
      })

      const aiData = await geminiResponse.json()
      if (!geminiResponse.ok) throw new Error(aiData.error?.message || 'Gemini API error')

      const reportContent = aiData.candidates?.[0]?.content?.parts?.[0]?.text
      if (!reportContent) throw new Error('Empty response from Gemini API')

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
    // Support multi-agent: if multiple agents selected, route to the first one
    // but include all selected agents' context in the system prompt
    const selectedAgentIds = (agent_ids && agent_ids.length > 0) ? agent_ids : (agent_id ? [agent_id] : [])
    const selectedAgents = selectedAgentIds.map((id: string) => agents?.find((a: any) => a.id === id)).filter(Boolean)
    const primaryAgent = selectedAgents[0] || null

    const isMaster = mode === 'chat' && selectedAgents.length === 0

    // Build multi-agent context
    let multiAgentContext = ''
    if (selectedAgents.length > 1) {
      multiAgentContext = '\n\nΕΠΙΛΕΓΜΕΝΟΙ AGENTS (συμμετέχουν στη συνομιλία):\n' +
        selectedAgents.map((a: any) => `- ${a.name} (${a.channel}, ${a.target_region || 'All Greece'}): ${a.base_prompt || 'Βοήθησε με ενεργειακές ερωτήσεις'}`).join('\n')
    }

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
      : `Είσαι ο ${primaryAgent?.name || 'Agent'} της Hlektrismos.gr.
Κανάλι Επικοινωνίας: ${primaryAgent?.channel}
Περιοχή Στόχου: ${primaryAgent?.target_region || 'Όλη η Ελλάδα'}
Βάση γνώσης (τιμολόγια):\n${tariffLines}
Μνήμη: ${memoryContext || 'Νέα συνομιλία'}
Οδηγίες: ${primaryAgent?.base_prompt || 'Βοήθησε τον χρήστη με ενεργειακές ερωτήσεις.'}
${multiAgentContext}
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

    // Call Gemini API with timeout
    const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-goog-api-key': geminiApiKey,
      },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: geminiMessages,
      }),
      signal: AbortSignal.timeout(60000),
    })

    const aiData = await geminiResponse.json()
    if (!geminiResponse.ok) {
      throw new Error(aiData.error?.message || 'Gemini API error')
    }

    const reply = aiData.candidates?.[0]?.content?.parts?.[0]?.text
    if (!reply) throw new Error('Empty response from Gemini API')

    // Save to agent_memory
    const memContextId = context_id && context_id !== 'null' ? context_id : crypto.randomUUID()
    const targetAgentId = primaryAgent?.id || 'orchestrator-director'

    await supabaseAdmin.from('agent_memory').insert([
      { agent_id: targetAgentId, context_id: memContextId, role: 'user', content: message },
      { agent_id: targetAgentId, context_id: memContextId, role: 'assistant', content: reply, metadata: { model: geminiModel, tokens: aiData.usageMetadata?.totalTokenCount } },
    ])

    // If multi-agent, save inter-agent messages
    if (selectedAgents.length > 1) {
      for (const agent of selectedAgents.slice(1)) {
        try {
          await supabaseAdmin.from('agent_conversations').insert({
            from_agent_id: selectedAgents[0].id,
            to_agent_id: agent.id,
            message: reply,
            message_type: 'broadcast',
          })
        } catch {
          // table may not exist
        }
      }
    }

    return new Response(JSON.stringify({
      reply,
      context_id: memContextId,
      agent_id: targetAgentId,
      model: geminiModel,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error: any) {
    const status = error.message?.includes('No Gemini API key') ? 400
      : error.message?.includes('Gemini API error') ? 502
      : error.message?.includes('Empty response') ? 502
      : 400
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status,
    })
  }
})
