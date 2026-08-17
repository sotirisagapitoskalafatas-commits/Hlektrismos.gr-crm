const supabaseUrl = 'https://nonaymiwdayfuulccxrl.supabase.co';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vbmF5bWl3ZGF5ZnV1bGNjeHJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYyODM1NzgsImV4cCI6MjEwMTg1OTU3OH0._MdulSqzuLCqGSCUZJWQ9BqizYBl60GsBr5H7JcMiQ8';

async function loginDemoUser() {
  const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'apikey': anonKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      email: 'demo@hlektrismos.gr',
      password: 'PowerForDemo2026!'
    })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || 'Login failed');
  return data;
}

async function insertAgents(agents, jwt) {
  const res = await fetch(`${supabaseUrl}/rest/v1/ai_agents`, {
    method: 'POST',
    headers: {
      'apikey': anonKey,
      'Authorization': `Bearer ${jwt}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify(agents)
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(errorText);
  }
}

async function seedAgents() {
  try {
    const authData = await loginDemoUser();
    const demoUserId = authData.user.id;
    const jwt = authData.access_token;
    
    console.log('Logged in as demo user:', demoUserId);

    const agentsToInsert = [
      {
        user_id: demoUserId,
        name: 'Αθήνα Email Bot',
        channel: 'email',
        status: 'paused',
        leads_contacted: 342,
        replies: 87,
        meetings_booked: 23,
        target_region: 'Αττική',
        base_prompt: 'Γράψε ένα επαγγελματικό email παρουσιάζοντας την Hlektrismos.gr και ζητώντας ένα σύντομο ραντεβού.',
        handoff_condition: 'Pricing Requested',
        skills: ['email_outreach', 'appointment_setting', 'pricing_comparison'],
        personality: 'Επαγγελματικός, αξιόπιστος, λεπτομερής'
      },
      {
        user_id: demoUserId,
        name: 'Θεσσαλονίκη SMS Agent',
        channel: 'sms',
        status: 'active',
        leads_contacted: 218,
        replies: 54,
        meetings_booked: 15,
        target_region: 'Θεσσαλονίκη',
        base_prompt: 'Γράψε ένα πολύ σύντομο και φιλικό SMS (κάτω από 160 χαρακτήρες) για προσφορά ρεύματος.',
        handoff_condition: 'Interest Confirmed',
        skills: ['sms_outreach', 'quick_engagement'],
        personality: 'Σύντομος, φιλικός, αποτελεσματικός'
      },
      {
        user_id: demoUserId,
        name: 'Νησιωτικό Voice Agent',
        channel: 'voice',
        status: 'paused',
        leads_contacted: 156,
        replies: 31,
        meetings_booked: 8,
        target_region: 'Νησιά Αιγαίου',
        base_prompt: 'Μίλα σαν να κάνεις τηλεφωνική κλήση. Ρώτησε αν ενδιαφέρονται για φωτοβολταϊκά.',
        handoff_condition: 'Interest Confirmed',
        skills: ['voice_calls', 'solar_expertise', 'island_market'],
        personality: 'Θερμός, περιστασιακός, εξειδικευμένος'
      },
      {
        user_id: demoUserId,
        name: 'B2B Outbound Email',
        channel: 'email',
        status: 'active',
        leads_contacted: 489,
        replies: 112,
        meetings_booked: 41,
        target_region: 'Αττική',
        base_prompt: 'Γράψε ένα αυστηρά επαγγελματικό B2B email για εταιρικό τιμολόγιο.',
        handoff_condition: 'Pricing Requested',
        skills: ['b2b_outreach', 'corporate_pricing', 'roi_analysis'],
        personality: 'Επαγγελματικός, αναλυτικός, αξιόπιστος'
      }
    ];

    await insertAgents(agentsToInsert, jwt);
    console.log('Successfully seeded AI agents!');
  } catch (error) {
    console.error('Error seeding agents:', error.message);
  }
}

seedAgents();
