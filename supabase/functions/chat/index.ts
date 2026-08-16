import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { messages } = await req.json()

    // Create a Supabase client to fetch tariffs
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    )

    // Fetch the tariffs from the database for RAG Context
    const { data: tariffs, error } = await supabaseClient
      .from('market_tariffs')
      .select('*')
    
    if (error) throw error;

    const tariffLines = tariffs?.map((t: any) => `- ${t.resource}: ${t.tariff_name} @ ${t.price_eur} ${t.unit}`).join('\n') || '';
    
    const systemPrompt = `Είσαι ο PowerFor Assistant, ένας έξυπνος βοηθός για εξοικονόμηση ενέργειας.
    
Ο ρόλος σου είναι να βοηθάς τους χρήστες να βρουν τα καλύτερα προγράμματα ρεύματος, φυσικού αερίου και φωτοβολταϊκών.
Να είσαι ευγενικός, συνοπτικός και επαγγελματίας.

Εδώ είναι τα σημερινά διαθέσιμα τιμολόγια (RAG Data):
${tariffLines}

Χρησιμοποίησε αυτές τις τιμές για να απαντήσεις αν σε ρωτήσουν για τιμές ρεύματος ή φυσικού αερίου. Εάν δεν ρωτήσουν για κάτι συγκεκριμένο, υπενθύμισε τους ότι μπορούν να συμπληρώσουν τη φόρμα επικοινωνίας στο τέλος της σελίδας για μια εξειδικευμένη δωρεάν προσφορά.`;

    const openAiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini', // Using gpt-4o-mini for better and faster performance
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages,
        ],
      }),
    })

    const aiData = await openAiResponse.json()
    const reply = aiData.choices[0].message.content

    return new Response(JSON.stringify({ reply }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
