import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://nonaymiwdayfuulccxrl.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vbmF5bWl3ZGF5ZnV1bGNjeHJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYyODM1NzgsImV4cCI6MjEwMTg1OTU3OH0._MdulSqzuLCqGSCUZJWQ9BqizYBl60GsBr5H7JcMiQ8';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function test() {
  try {
    const { data, error } = await supabase.functions.invoke('chat', {
      body: { messages: [{ role: 'user', content: 'hello' }] },
    });
    
    console.log('Data:', data);
    console.log('Error:', error);
  } catch (err) {
    console.error('Catch Error:', err);
  }
}

test();
