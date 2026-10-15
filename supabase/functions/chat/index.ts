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
    const { messages, visitorInfo, callbackRequest } = await req.json()

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    )

    // Fetch tariffs for RAG context
    const { data: tariffs } = await supabaseClient.rpc('get_active_tariff_prices');
    const tariffLines = tariffs?.map((t: any) => `- ${t.provider_name}: ${t.program_name} @ €${t.unit_rate_kwh}/kWh (€${t.fixed_fee_monthly}/mo)`).join('\n') || '';

    // Handle callback request — store as lead
    if (callbackRequest) {
      const { name, phone, email, message, billAmount, currentProvider, consumption } = callbackRequest;

      // Server-side gate: no lead is stored unless the visitor confirmed they
      // are 18+ and consented to be contacted (asked in lib/jarvis-chat.ts).
      if (callbackRequest.age_confirmed !== true || callbackRequest.consent !== true) {
        return new Response(JSON.stringify({
          reply: 'Για να καταχωρήσουμε αίτημα κλήσης χρειάζεται επιβεβαίωση ότι είστε ενήλικας και συγκατάθεση επικοινωνίας. Δεν αποθηκεύτηκε κανένα στοιχείο.',
          callbackConfirmed: false,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 })
      }
      
      // Stored in public.leads (the table the CRM shows) through the same public intake RPC as the website form,
      // which re-checks consent and 18+ in the database. Previously this wrote to the legacy hlektrismos_leads table,
      // which the CRM does not list, so chatbot callback requests never reached the team.
      const fullName = String(name ?? '').trim().replace(/\s+/g, ' ');
      const { error: insertError } = await supabaseClient.rpc('insert_website_lead', {
        p_source: 'website',
        p_payload: {
          full_name: fullName || null,
          first_name: fullName ? fullName.split(' ')[0] : null,
          last_name: fullName ? fullName.split(' ').slice(1).join(' ') : null,
          phone: phone || null,
          email: email || null,
          comments: message || `Αίτημα κλήσης από το chatbot. Τρέχων λογαριασμός: ${billAmount || 'Δεν δόθηκε'}€. Πάροχος: ${currentProvider || 'Δεν δόθηκε'}. Κατανάλωση: ${consumption || 'Δεν δόθηκε'} kWh.`,
          gdpr_consent: true,
          age_confirmed: true,
          campaign_name: 'Chatbot',
        },
      })

      if (insertError) throw insertError;

      return new Response(JSON.stringify({ 
        reply: `Ευχαριστούμε, ${name || 'φίλε μου'}! Ένας εξειδικευμένος σύμβουλός μας θα σε καλέσει στο ${phone} το συντομότερο δυνατό. Συνήθως επικοινωνούμε εντός 1-2 ωρών στις εργάσιμες. Αν έχεις άλλες ερωτήσεις, είμαι εδώ!`,
        callbackConfirmed: true 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    const visitorContext = visitorInfo 
      ? `\n\nΠληροφορίες επισκέπτη που έχεις συλλέξει ήδη:\n${JSON.stringify(visitorInfo, null, 2)}`
      : '';

    const systemPrompt = `Είσαι ο Αλέξης, ένας ζωντανός υπάλληλος υποστήριξης πελατών της Hlektrismos.gr. Μιλάς Ελληνικά.
Προσωπικότητα: Είσαι φιλικός, επαγγελματίας, και ενεργός. Μιλάς σαν πραγματικός άνθρωπος, όχι ρομπότ. Χρησιμοποιείς φυσική γλώσσα.

ΣΚΟΠΟΣ ΣΟΥ (σειρά προτεραιοτήτων):
1. Καλωσόρισμα του επισκέπτη με ζεστό τρόπο.
2. Μάθε το όνομά του.
3. Μάθε τι χρειάζεται (ρεύμα, αέριο, φωτοβολταϊκά, ηλεκτροκίνηση).
4. Μάθε τον τρέχοντα λογαριασμό του (πόσο πληρώνει το μήνα) και τον πάροχό του.
5. Αν έχει λογαριασμό ρεύματος, ρώτα: "Πόσο πληρώνεις κάθε μήνα για ρεύμα;" και "Ποιος είναι ο πάροχός σου;"
6. Πρότεινε τη δωρεάν εξοικονόμηση και ζήτα callback από εξειδικευμένο σύμβουλο.
7. Ζήτα: όνομα, τηλέφωνο, email.

ΡΟΗ ΣΥΝΟΜΙΛΙΑΣ:
- Αν ο χρήστης σου δώσει πληροφορίες (π.χ. "πληρώνω 150€"), αποδέξου τις και συνέχισε.
- Αν σου δώσει το τηλέφωνό του, ζήτα και email.
- Αν σου δώσει όλα τα στοιχεία, ενημέρωσέ τον ότι θα τον καλέσουμε.
- Αν ρωτάει για τιμές, χρησιμοποίησε τα τιμολόγια παρακάτω.
- Μην είσαι υπερβολικά μακρύς. Κράτα τις απαντήσεις σε 2-3 προτάσεις.
- Αν δεν καταλαβαίνεις κάτι, ζήτα επεξήγηση φιλικά.
- ΠΟΤΕ μην πεις ότι είσαι AI ή chatbot. Είσαι "Αλέξης, σύμβουλος ενέργειας".

ΤΙΜΟΛΟΓΙΑ (RAG Data):
${tariffLines}

${visitorContext}

ΑΠΑΝΤΗΣΕΙΣ:
- Αν σε ρωτήσουν για τιμές, δώσε συγκεκριμένα τιμολόγια.
- Αν σε ρωτήσουν για διαδικασία, εξήγησε ότι υπογράφεις σύμβαση προμήθειας και τα υπόλοιπα τα διαχειριζόμαστε εμείς.
- Αν θέλουν callback, ζήτα στοιχεία επικοινωνίας (όνομα, τηλέφωνο, email) και υπόσχεσαι κλήση.
- Αν ρωτήσουν αν είσαι bot, απάντησε "Είμαι ο Αλέξης, σύμβουλος ενέργειας της Hlektrismos.gr".`;

    const geminiMessages = messages.map((m: any) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));

    const geminiApiKey = Deno.env.get('GEMINI_API_KEY') || Deno.env.get('CRM_AI_AGENT') || Deno.env.get('CRM_AI_AGENT_2') || '';

    // Thinking models spend output tokens on hidden reasoning — with a low
    // maxOutputTokens the visible reply gets cut off mid-sentence. Raise the
    // cap and disable thinking; fall back gracefully if the model rejects
    // thinkingConfig.
    const buildRequestBody = (disableThinking: boolean) => ({
      system_instruction: {
        parts: [{ text: systemPrompt }]
      },
      contents: geminiMessages,
      generationConfig: {
        temperature: 0.8,
        maxOutputTokens: 2048,
        ...(disableThinking ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
      }
    });

    const callGemini = (body: any) => fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-goog-api-key': geminiApiKey,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    })

    let geminiResponse = await callGemini(buildRequestBody(true));
    if (!geminiResponse.ok) {
      geminiResponse = await callGemini(buildRequestBody(false));
    }

    const aiData = await geminiResponse.json()
    
    if (!geminiResponse.ok) {
      throw new Error(aiData.error?.message || 'Failed to fetch from Gemini API');
    }

    const reply = aiData.candidates?.[0]?.content?.parts?.[0]?.text
    if (!reply) throw new Error('Empty response from Gemini API')

    return new Response(JSON.stringify({ reply }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error: any) {
    const status = error.message?.includes('GEMINI_API_KEY') ? 500
      : error.message?.includes('Gemini API error') || error.message?.includes('Failed to fetch') ? 502
      : error.message?.includes('Empty response') ? 502
      : 400
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status,
    })
  }
})
