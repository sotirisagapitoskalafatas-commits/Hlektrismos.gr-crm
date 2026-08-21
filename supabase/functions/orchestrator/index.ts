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

// Gemini Function Calling tools — allow AI to take real actions
const GEMINI_TOOLS = [
  {
    function_declarations: [
      {
        name: 'search_leads',
        description: 'Αναζήτηση leads στο CRM. Επιστρέφει λίστα leads με βάση τα κριτήρια.',
        parameters: {
          type: 'OBJECT',
          properties: {
            query: { type: 'STRING', description: 'Ελεύθερο κείμενο αναζήτησης (όνομα, email, τηλέφωνο)' },
            status: { type: 'STRING', description: 'Φίλτρο κατάστασης: new, contacted, qualified, meeting_booked, proposal_sent, won, lost' },
            source: { type: 'STRING', description: 'Πηγή: B2B Scraper, Landing Page, Manual, Email Inbound, Κλπ.' },
            limit: { type: 'INTEGER', description: 'Μέγιστος αριθμός αποτελεσμάτων (default 10)' },
          },
        },
      },
      {
        name: 'update_lead_status',
        description: 'Ενημέρωση κατάστασης lead. Αλλάζει το status ενός lead.',
        parameters: {
          type: 'OBJECT',
          properties: {
            lead_id: { type: 'STRING', description: 'Το ID του lead' },
            status: { type: 'STRING', description: 'Νέο status: new, contacted, qualified, meeting_booked, proposal_sent, won, lost' },
            notes: { type: 'STRING', description: 'Προαιρετικό σημείωμα για την αλλαγή' },
          },
          required: ['lead_id', 'status'],
        },
      },
      {
        name: 'send_email_to_lead',
        description: 'Αποστολή email σε lead. Χρησιμοποιεί το SMTP της εταιρείας.',
        parameters: {
          type: 'OBJECT',
          properties: {
            lead_id: { type: 'STRING', description: 'Το ID του lead' },
            subject: { type: 'STRING', description: 'Θέμα email' },
            body: { type: 'STRING', description: 'Σώμα email (plain text)' },
          },
          required: ['lead_id', 'subject', 'body'],
        },
      },
      {
        name: 'trigger_b2b_scraper',
        description: 'Εκκίνηση B2B scraper για αναζήτηση επιχειρήσεων σε συγκεκριμένη περιοχή/κατηγορία.',
        parameters: {
          type: 'OBJECT',
          properties: {
            region: { type: 'STRING', description: 'Περιοχή: Αττική, Θεσσαλονίκη, Πάτρα, Ηράκλειο, Λάρισα, Βόλος, Ιωάννινα, Κομοτηνή, Καβάλα, Ξάνθη' },
            category: { type: 'STRING', description: 'Κατηγορία επιχείρησης: Ξενοδοχεία, Εστιατόρια, Βιομηχανία, Λιανικό, Υγεία, Εκπαίδευση, Κυβέρνηση, Τουρισμός, Τεχνολογία, Γεωργία, Κτηνοτροφία, Ενέργεια, Κατασκευές, Μεταφορές' },
          },
          required: ['region', 'category'],
        },
      },
      {
        name: 'get_market_tariffs',
        description: 'Ανάκτηση ταρίφων αγοράς. Επιστρέφει τα τρέχοντα ταρίφα για πάροχο ή πόρο.',
        parameters: {
          type: 'OBJECT',
          properties: {
            provider: { type: 'STRING', description: 'Όνομα παρόχου: ΔΕΗ, Protergia, ΗΡΩΝ, ZeniΘ, nrg, Φυσικό Αέριο, Volton, Ελίν, Enerwave, Eunice Power' },
            category: { type: 'STRING', description: 'B2B ή B2C' },
            resource: { type: 'STRING', description: 'Πόρος: ρεύμα, φυσικό αέριο' },
          },
        },
      },
      {
        name: 'add_lead_note',
        description: 'Προσθήκη σημειώματος σε lead. Αποθηκεύεται στο timeline του lead.',
        parameters: {
          type: 'OBJECT',
          properties: {
            lead_id: { type: 'STRING', description: 'Το ID του lead' },
            content: { type: 'STRING', description: 'Το κείμενο του σημειώματος' },
            author: { type: 'STRING', description: 'Συντάκτης (προαιρετικό, default: AI Agent)' },
          },
          required: ['lead_id', 'content'],
        },
      },
      {
        name: 'get_lead_details',
        description: 'Λήψη λεπτομερειών ενός lead με βάση το ID. Επιστρέφει πλήρες προφίλ lead.',
        parameters: {
          type: 'OBJECT',
          properties: {
            lead_id: { type: 'STRING', description: 'Το ID του lead' },
          },
          required: ['lead_id'],
        },
      },
      {
        name: 'get_agent_performance',
        description: 'Ανάκτηση στατιστικών απόδοσης ενός agent ή όλης της ομάδας.',
        parameters: {
          type: 'OBJECT',
          properties: {
            agent_id: { type: 'STRING', description: 'Το ID του agent (προαιρετικό, αν αφεθεί κενό επιστρέφει όλους)' },
          },
        },
      },
      {
        name: 'schedule_meeting',
        description: 'Προγραμματισμός συνάντησης ή κλήσης με lead. Αποθηκεύεται στο ημερολόγιο.',
        parameters: {
          type: 'OBJECT',
          properties: {
            title: { type: 'STRING', description: 'Τίτλος event (π.χ. "Συνάντηση με ΔΕΗ")' },
            lead_id: { type: 'STRING', description: 'Το ID του lead (προαιρετικό)' },
            event_type: { type: 'STRING', description: 'Τύπος: meeting, call, follow_up, deadline' },
            start_time: { type: 'STRING', description: 'Ημερομηνία/ώρα έναρξης (ISO 8601, π.χ. 2026-08-20T14:00:00)' },
            end_time: { type: 'STRING', description: 'Ημερομηνία/ώρα λήξης (ISO 8601, προαιρετικό)' },
            location: { type: 'STRING', description: 'Τοποθεσία (π.χ. Zoom, γραφείο)' },
            notes: { type: 'STRING', description: 'Σημειώσεις' },
          },
          required: ['title', 'start_time'],
        },
      },
      {
        name: 'get_calendar_events',
        description: 'Ανάκτηση events από το ημερολόγιο. Επιστρέφει επερχόμενα ή προηγούμενα events.',
        parameters: {
          type: 'OBJECT',
          properties: {
            from_date: { type: 'STRING', description: 'Από πότε (ISO date, default: σήμερα)' },
            to_date: { type: 'STRING', description: 'Έως πότε (ISO date, default: +30 ημέρες)' },
            status: { type: 'STRING', description: 'Φίλτρο status: scheduled, completed, cancelled' },
          },
        },
      },
      {
        name: 'check_calendar_availability',
        description: 'Έλεγχος διαθεσιμότητας στο ημερολόγιο για συγκεκριμένη ώρα/ημερομηνία. Επιστρέφει true/false και ποια events υπάρχουν ήδη.',
        parameters: {
          type: 'OBJECT',
          properties: {
            check_date: { type: 'STRING', description: 'Ημερομηνία ελέγχου (ISO 8601, π.χ. 2026-08-25T14:00:00)' },
            duration_minutes: { type: 'NUMBER', description: 'Διάρκεια σε λεπτά (default: 30)' },
          },
          required: ['check_date'],
        },
      },
      {
        name: 'book_appointment',
        description: 'Κλείσιμο ραντεβού/κλήσης με lead. Ελέγχει διαθεσιμότητα, δημιουργεί event, στέλνει email confirmation και ενημερώνει το lead.',
        parameters: {
          type: 'OBJECT',
          properties: {
            lead_id: { type: 'STRING', description: 'Lead ID' },
            title: { type: 'STRING', description: 'Τίτλος ραντεβού (π.χ. "Τηλεφωνική συζήτηση προσφοράς")' },
            start_time: { type: 'STRING', description: 'Ημερομηνία/ώρα έναρξης (ISO 8601)' },
            duration_minutes: { type: 'NUMBER', description: 'Διάρκεια σε λεπτά (default: 30)' },
            event_type: { type: 'STRING', description: 'meeting, call, follow_up' },
            location: { type: 'STRING', description: 'Τοποθεσία (π.χ. Zoom, τηλέφωνο, γραφείο)' },
            send_confirmation: { type: 'BOOLEAN', description: 'Αποστολή email confirmation (default: true)' },
          },
          required: ['lead_id', 'title', 'start_time'],
        },
      },
    ],
  },
]

// Execute a function call from Gemini and return the result
async function executeFunctionCall(fn: any, args: any, supabaseAdmin: any): Promise<string> {
  try {
    switch (fn) {
      case 'search_leads': {
        let query = supabaseAdmin.from('hlektrismos_leads').select('*')
        if (args.query) {
          query = query.or(`first_name.ilike.%${args.query}%,last_name.ilike.%${args.query}%,email.ilike.%${args.query}%,phone.ilike.%${args.query}%`)
        }
        if (args.status) query = query.eq('status', args.status)
        if (args.source) query = query.eq('source', args.source)
        query = query.order('created_at', { ascending: false }).limit(args.limit || 10)
        const { data, error } = await query
        if (error) throw error
        if (!data || data.length === 0) return 'Δεν βρέθηκαν leads με αυτά τα κριτήρια.'
        return JSON.stringify(data.map((l: any) => ({
          id: l.id, name: `${l.first_name} ${l.last_name}`, email: l.email, phone: l.phone,
          company: l.company_name, status: l.status, source: l.source, created: l.created_at,
        })), null, 0)
      }

      case 'update_lead_status': {
        const updates: any = { status: args.status }
        if (args.notes) updates.notes = args.notes
        const { error } = await supabaseAdmin.from('hlektrismos_leads').update(updates).eq('id', args.lead_id)
        if (error) throw error
        // Also save as note
        if (args.notes) {
          await supabaseAdmin.from('lead_notes').insert({ lead_id: args.lead_id, content: args.notes, author: 'AI Agent', note_type: 'status_change' })
        }
        return `✅ Lead ${args.lead_id} status → ${args.status}`
      }

      case 'send_email_to_lead': {
        // Fetch lead for email address
        const { data: lead, error: leadErr } = await supabaseAdmin.from('hlektrismos_leads').select('email,first_name,last_name').eq('id', args.lead_id).single()
        if (leadErr || !lead) return `❌ Lead ${args.lead_id} not found`
        if (!lead.email) return `❌ Lead has no email address`

        // Call send-email Edge Function
        const { data: emailConfig } = await supabaseAdmin.from('crm_settings').select('setting_value').eq('setting_key', 'email_config').single()
        const config = emailConfig?.setting_value || {}

        // Build raw email and send via Deno.connect
        const rawEmail = `From: ${config.from_name || 'Hlektrismos.gr'} <${config.from_email || 'info@hlektrismos.gr'}>\r\nTo: ${lead.email}\r\nSubject: ${args.subject}\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${args.body}`

        // Log to crm_emails
        await supabaseAdmin.from('crm_emails').insert({
          from_address: config.from_email || 'info@hlektrismos.gr',
          to_addresses: [lead.email],
          subject: args.subject,
          body: args.body,
          direction: 'outbound',
          lead_id: args.lead_id,
          status: 'queued',
        })

        return `✅ Email queued: "${args.subject}" → ${lead.first_name} ${lead.last_name} (${lead.email}). Θα σταλεί μέσω SMTP.`
      }

      case 'trigger_b2b_scraper': {
        // Trigger the scrape-b2b Edge Function
        const response = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/scrape-b2b`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          },
          body: JSON.stringify({ region: args.region, category: args.category }),
        })
        const result = await response.json()
        return `✅ B2B Scraper εκκινήθηκε για ${args.region} / ${args.category}. Αποτέλεσμα: ${result.leads_found || 0} leads βρέθηκαν.`
      }

      case 'get_market_tariffs': {
        let query = supabaseAdmin.from('market_tariffs').select('*')
        if (args.provider) query = query.eq('provider_name', args.provider)
        if (args.category) query = query.eq('category', args.category)
        if (args.resource) query = query.eq('resource', args.resource)
        const { data, error } = await query
        if (error) throw error
        if (!data || data.length === 0) return 'Δεν βρέθηκαν ταρίφα.'
        return data.map((t: any) =>
          `${t.provider_name} | ${t.tariff_name} | ${t.category} | €${t.price_eur}/kWh | €${t.fixed_fee_monthly || 0}/μήνα`
        ).join('\n')
      }

      case 'add_lead_note': {
        const { error } = await supabaseAdmin.from('lead_notes').insert({
          lead_id: args.lead_id, content: args.content, author: args.author || 'AI Agent', note_type: 'ai_note',
        })
        if (error) throw error
        return `✅ Σημείωμα προστέθηκε στο lead ${args.lead_id}`
      }

      case 'get_lead_details': {
        const { data: lead, error } = await supabaseAdmin.from('hlektrismos_leads').select('*').eq('id', args.lead_id).single()
        if (error || !lead) return `❌ Lead ${args.lead_id} not found`
        return JSON.stringify(lead, null, 0)
      }

      case 'get_agent_performance': {
        let query = supabaseAdmin.from('ai_agents').select('*').eq('status', 'active').is('deleted_at', null)
        if (args.agent_id) query = query.eq('id', args.agent_id)
        const { data: agents, error } = await query
        if (error) throw error
        if (!agents || agents.length === 0) return 'Δεν βρέθηκαν agents.'
        return agents.map((a: any) =>
          `${a.name} | Channel: ${a.channel} | Region: ${a.target_region || 'All'} | Leads: ${a.leads_contacted} | Replies: ${a.replies} | Meetings: ${a.meetings_booked} | Conv: ${a.leads_contacted > 0 ? ((a.meetings_booked / a.leads_contacted) * 100).toFixed(1) : 0}%`
        ).join('\n')
      }

      case 'schedule_meeting': {
        const eventData: any = {
          title: args.title,
          event_type: args.event_type || 'meeting',
          start_time: args.start_time,
          status: 'scheduled',
        }
        if (args.lead_id) eventData.lead_id = args.lead_id
        if (args.end_time) eventData.end_time = args.end_time
        if (args.location) eventData.location = args.location
        if (args.notes) eventData.notes = args.notes

        const { data: evt, error } = await supabaseAdmin.from('calendar_events').insert(eventData).select().single()
        if (error) throw error

        // Also add as note to the lead if lead_id provided
        if (args.lead_id) {
          await supabaseAdmin.from('lead_notes').insert({
            lead_id: args.lead_id,
            content: `📅 Προγραμματίστηκε ${args.event_type === 'call' ? 'κλήση' : args.event_type === 'meeting' ? 'συνάντηση' : args.event_type}: "${args.title}" στις ${new Date(args.start_time).toLocaleString('el-GR')}`,
            author: 'AI Agent',
            note_type: 'calendar_event',
          })
        }

        return `✅ Event δημιουργήθηκε: "${args.title}" στις ${new Date(args.start_time).toLocaleString('el-GR')}${args.location ? ` (${args.location})` : ''}`
      }

      case 'get_calendar_events': {
        const fromDate = args.from_date || new Date().toISOString().slice(0, 10)
        const toDate = args.to_date || new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)

        let query = supabaseAdmin.from('calendar_events')
          .select('*')
          .gte('start_time', `${fromDate}T00:00:00`)
          .lte('start_time', `${toDate}T23:59:59`)
          .order('start_time', { ascending: true })

        if (args.status) query = query.eq('status', args.status)

        const { data: events, error } = await query
        if (error) throw error
        if (!events || events.length === 0) return 'Δεν βρέθηκαν events στο ημερολόγιο.'

        return events.map((e: any) =>
          `${e.status === 'scheduled' ? '📅' : e.status === 'completed' ? '✅' : '❌'} ${e.title} | ${new Date(e.start_time).toLocaleString('el-GR')} | ${e.event_type}${e.location ? ` | ${e.location}` : ''}`
        ).join('\n')
      }

      case 'check_calendar_availability': {
        const checkDate = new Date(args.check_date)
        const duration = args.duration_minutes || 30
        const endDate = new Date(checkDate.getTime() + duration * 60000)

        const { data: conflicts } = await supabaseAdmin
          .from('calendar_events')
          .select('id, title, start_time, end_time, event_type')
          .eq('status', 'scheduled')
          .lte('start_time', endDate.toISOString())
          .gte('end_time', checkDate.toISOString())

        const isAvailable = !conflicts || conflicts.length === 0
        const conflictList = conflicts?.map((c: any) =>
          `  - ${c.title} (${c.event_type}) ${new Date(c.start_time).toLocaleString('el-GR')}`
        ).join('\n') || '  (none)'

        return JSON.stringify({
          available: isAvailable,
          check_time: checkDate.toLocaleString('el-GR'),
          duration_minutes: duration,
          conflicting_events: conflicts?.length || 0,
          details: isAvailable ? 'Η ώρα είναι διαθέσιμη.' : `Υπάρχουν ${conflicts?.length} συγκρούσεις:\n${conflictList}`,
        })
      }

      case 'book_appointment': {
        // 1. Check availability
        const bookStart = new Date(args.start_time)
        const bookDuration = args.duration_minutes || 30
        const bookEnd = new Date(bookStart.getTime() + bookDuration * 60000)

        const { data: existing } = await supabaseAdmin
          .from('calendar_events')
          .select('id, title')
          .eq('status', 'scheduled')
          .lte('start_time', bookEnd.toISOString())
          .gte('end_time', bookStart.toISOString())

        if (existing && existing.length > 0) {
          return `❌ Η ώρα ${bookStart.toLocaleString('el-GR')} δεν είναι διαθέσιμη. Υπάρχει ήδη: "${existing[0].title}". Ζητήστε άλλη ώρα.`
        }

        // 2. Fetch lead info
        const { data: lead } = await supabaseAdmin
          .from('hlektrismos_leads')
          .select('id, first_name, last_name, email')
          .eq('id', args.lead_id)
          .single()

        if (!lead) return `❌ Lead ${args.lead_id} δεν βρέθηκε.`

        // 3. Create calendar event
        const { data: evt, error: evtErr } = await supabaseAdmin.from('calendar_events').insert({
          lead_id: args.lead_id,
          title: args.title,
          event_type: args.event_type || 'meeting',
          start_time: bookStart.toISOString(),
          end_time: bookEnd.toISOString(),
          location: args.location || '',
          status: 'scheduled',
          notes: `Booked by AI Agent for ${lead.first_name} ${lead.last_name}`,
        }).select().single()

        if (evtErr) throw evtErr

        // 4. Add lead note
        await supabaseAdmin.from('lead_notes').insert({
          lead_id: args.lead_id,
          content: `📅 Ραντεβού κλείστηκε: "${args.title}" στις ${bookStart.toLocaleString('el-GR')}${args.location ? ` (${args.location})` : ''} (${bookDuration} λεπτά)`,
          author: 'AI Agent',
          note_type: 'calendar_event',
        })

        // 5. Send confirmation email if requested
        if (args.send_confirmation !== false && lead.email) {
          try {
            const { data: emailConfig } = await supabaseAdmin.from('crm_settings').select('setting_value').eq('setting_key', 'email_config').single()
            const config = emailConfig?.setting_value || {}

            const confirmationBody = `Γεια σας ${lead.first_name},\n\nΤο ραντεβού σας "${args.title}" έχει προγραμματιστεί:\n\n📅 Ημερομηνία: ${bookStart.toLocaleDateString('el-GR')}\n⏰ Ώρα: ${bookStart.toLocaleTimeString('el-GR')}\n⏱️ Διάρκεια: ${bookDuration} λεπτά\n📍 Τοποθεσία: ${args.location || 'Τηλεφωνικά'}\n\nΘα επικοινωνήσουμε μαζί σας σύντομα.\n\nΜε εκτίμηση,\nHlektrismos.gr`

            const rawEmail = `From: ${config.from_name || 'Hlektrismos.gr'} <${config.from_email || 'info@hlektrismos.gr'}>\r\nTo: ${lead.email}\r\nSubject: ✅ Επιβεβαίωση ραντεβού - ${args.title}\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${confirmationBody}`

            // Send via SMTP using port 465
            const encoder = new TextEncoder()
            const hostname = config.smtp_host || 'smtp.gmail.com'
            const port = 465
            const conn = await Deno.connect({ hostname, port, transport: 'tls' } as any)

            const reader = conn.readable.getReader()
            const writer = conn.writable.getWriter()

            const readResponse = async () => {
              const chunks: Uint8Array[] = []
              while (true) {
                const { value, done } = await reader.read()
                if (done) break
                chunks.push(value)
                const text = new TextDecoder().decode(value)
                if (text.includes('\r\n')) break
              }
              return new TextDecoder().decode(new Uint8Array([...chunks.flatMap(c => [...c])]))
            }

            await readResponse()
            await writer.write(encoder.encode(`EHLO hlektrismos.gr\r\n`))
            await readResponse()
            await writer.write(encoder.encode(`AUTH LOGIN\r\n`))
            await readResponse()
            await writer.write(encoder.encode(btoa(config.smtp_user || '') + '\r\n'))
            await readResponse()
            await writer.write(encoder.encode(btoa(config.smtp_pass || '') + '\r\n'))
            await readResponse()
            await writer.write(encoder.encode(`MAIL FROM:<${config.from_email || 'info@hlektrismos.gr'}>\r\n`))
            await readResponse()
            await writer.write(encoder.encode(`RCPT TO:<${lead.email}>\r\n`))
            await readResponse()
            await writer.write(encoder.encode(`DATA\r\n`))
            await readResponse()
            await writer.write(encoder.encode(rawEmail + `\r\n.\r\n`))
            await readResponse()
            await writer.write(encoder.encode(`QUIT\r\n`))
            await readResponse()
            conn.close()
          } catch (emailErr) {
            console.log('Confirmation email failed:', emailErr)
          }
        }

        return `✅ Ραντεβού κλείστηκε: "${args.title}" για ${lead.first_name} ${lead.last_name} στις ${bookStart.toLocaleString('el-GR')}${args.location ? ` (${args.location})` : ''}`
      }

      default:
        return `❌ Unknown function: ${fn}`
    }
  } catch (err: any) {
    return `❌ Error executing ${fn}: ${err.message}`
  }
}

serve(async (req: any) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const isReport = url.searchParams.get('mode') === 'report' || url.pathname.endsWith('/report')
    const isStream = url.searchParams.get('stream') === 'true' || req.headers.get('accept') === 'text/event-stream'

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

    // Also try to fetch from agent_messages (new persistent sessions)
    if (!memoryContext && context_id) {
      try {
        const { data: sessionMessages } = await supabaseAdmin
          .from('agent_messages')
          .select('*')
          .eq('session_id', context_id)
          .order('created_at', { ascending: true })
          .limit(30)

        if (sessionMessages && sessionMessages.length > 0) {
          memoryContext = sessionMessages.map((m: any) => `[${m.role}]: ${m.content}`).join('\n')
        }
      } catch {
        // agent_messages table may not exist
      }
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

    // Call Gemini API — always use non-streaming for function calling support
    const geminiApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent`

    const requestBody: any = {
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: geminiMessages,
      tools: GEMINI_TOOLS,
      tool_config: { function_calling_config: { mode: 'AUTO' } },
    }

    let geminiResponse = await fetch(geminiApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-goog-api-key': geminiApiKey,
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(120000),
    })

    if (!geminiResponse.ok) {
      const errData = await geminiResponse.json().catch(() => ({}))
      throw new Error(errData.error?.message || `Gemini API error: ${geminiResponse.status}`)
    }

    let aiData = await geminiResponse.json()

    // ---- AGENTIC LOOP: Execute function calls until Gemini returns text ----
    const MAX_TOOL_ROUNDS = 6
    let toolRound = 0

    while (toolRound < MAX_TOOL_ROUNDS) {
      const candidate = aiData.candidates?.[0]
      const parts = candidate?.content?.parts || []

      // Check if there are function calls
      const functionCalls = parts.filter((p: any) => p.functionCall)
      if (functionCalls.length === 0) break // No more tool calls, we have our text answer

      toolRound++

      // Add the model's function call message to conversation
      geminiMessages.push({ role: 'model', parts })

      // Execute each function call and collect results
      const functionResponses: any[] = []
      for (const fc of functionCalls) {
        const fnName = fc.functionCall.name
        const fnArgs = fc.functionCall.args || {}
        console.log(`[Tool Round ${toolRound}] Calling: ${fnName}`, JSON.stringify(fnArgs))
        const result = await executeFunctionCall(fnName, fnArgs, supabaseAdmin)
        functionResponses.push({
          functionResponse: {
            name: fnName,
            response: { result },
          },
        })
      }

      // Add function results to conversation and call Gemini again
      geminiMessages.push({ role: 'user', parts: functionResponses })

      geminiResponse = await fetch(geminiApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-goog-api-key': geminiApiKey,
        },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: geminiMessages,
          tools: GEMINI_TOOLS,
          tool_config: { function_calling_config: { mode: 'AUTO' } },
        }),
        signal: AbortSignal.timeout(120000),
      })

      if (!geminiResponse.ok) {
        const errData = await geminiResponse.json().catch(() => ({}))
        throw new Error(errData.error?.message || `Gemini API error after tool call: ${geminiResponse.status}`)
      }

      aiData = await geminiResponse.json()
    }

    // ---- STREAMING MODE: Emit final text as SSE chunks for UI ----
    if (isStream) {
      const memContextId = context_id && context_id !== 'null' ? context_id : crypto.randomUUID()
      const targetAgentId = primaryAgent?.id || 'orchestrator-director'

      // Extract final text from the agentic loop result
      const finalText = aiData.candidates?.[0]?.content?.parts?.[0]?.text || ''
      if (!finalText) throw new Error('Empty response from Gemini API')

      // Emit as simulated SSE stream (chunked for UI progressive rendering)
      const stream = new ReadableStream({
        start(controller) {
          const chunkSize = 40
          for (let i = 0; i < finalText.length; i += chunkSize) {
            const chunk = finalText.slice(i, i + chunkSize)
            controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ chunk, done: false })}\n\n`))
          }
          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ chunk: '', done: true, context_id: memContextId, agent_id: targetAgentId, model: geminiModel, tool_rounds: toolRound })}\n\n`))
          controller.close()
        }
      })

      // Save memory async
      supabaseAdmin.from('agent_memory').insert([
        { agent_id: targetAgentId, context_id: memContextId, role: 'user', content: message },
        { agent_id: targetAgentId, context_id: memContextId, role: 'assistant', content: finalText, metadata: { model: geminiModel, tool_rounds: toolRound } },
      ]).catch(() => {})

      if (context_id) {
        supabaseAdmin.from('agent_messages').insert([
          { session_id: context_id, role: 'user', content: message },
          { session_id: context_id, role: 'assistant', content: finalText, agent_id: targetAgentId, model: geminiModel },
        ]).catch(() => {})
      }

      return new Response(stream, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
        status: 200,
      })
    }

    // NON-STREAMING MODE: Return JSON response

    const reply = aiData.candidates?.[0]?.content?.parts?.[0]?.text
    if (!reply) throw new Error('Empty response from Gemini API')

    // Save to agent_memory
    const memContextId = context_id && context_id !== 'null' ? context_id : crypto.randomUUID()
    const targetAgentId = primaryAgent?.id || 'orchestrator-director'

    await supabaseAdmin.from('agent_memory').insert([
      { agent_id: targetAgentId, context_id: memContextId, role: 'user', content: message },
      { agent_id: targetAgentId, context_id: memContextId, role: 'assistant', content: reply, metadata: { model: geminiModel, tokens: aiData.usageMetadata?.totalTokenCount } },
    ])

    // Also save to agent_messages (persistent sessions)
    if (context_id) {
      try {
        await supabaseAdmin.from('agent_messages').insert([
          { session_id: context_id, role: 'user', content: message },
          { session_id: context_id, role: 'assistant', content: reply, agent_id: targetAgentId, model: geminiModel },
        ])
      } catch { /* table may not exist */ }
    }

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
