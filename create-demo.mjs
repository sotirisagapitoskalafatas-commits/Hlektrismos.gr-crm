const supabaseUrl = 'https://nonaymiwdayfuulccxrl.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vbmF5bWl3ZGF5ZnV1bGNjeHJsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjI4MzU3OCwiZXhwIjoyMTAxODU5NTc4fQ.eN8KuixoUHsCk0z9MJxqgLqPB2wUgvIogwYV-3bgyG4';

async function createDemoUser() {
  console.log('Creating demo user...');
  const res = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      'apikey': supabaseServiceKey,
      'Authorization': `Bearer ${supabaseServiceKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      email: 'demo@hlektrismos.gr',
      password: 'PowerForDemo2026!',
      email_confirm: true
    })
  });

  const data = await res.json();
  if (!res.ok) {
    console.error('Error creating user:', data);
  } else {
    console.log('Successfully created demo user:', data.id);
  }
}

createDemoUser();
