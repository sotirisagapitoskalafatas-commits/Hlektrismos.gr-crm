import fetch from 'node-fetch';

const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vbmF5bWl3ZGF5ZnV1bGNjeHJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYyODM1NzgsImV4cCI6MjEwMTg1OTU3OH0._MdulSqzuLCqGSCUZJWQ9BqizYBl60GsBr5H7JcMiQ8';

async function test() {
  const res = await fetch('https://nonaymiwdayfuulccxrl.supabase.co/functions/v1/chat', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'hello' }] })
  });
  
  console.log('Status:', res.status);
  const text = await res.text();
  console.log('Body:', text);
}

test();
