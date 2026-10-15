# Ad-form webhook (`receive-lead-webhook`) — staging test

**Staging only:** project ref **`jiencxiapucrexpmzxbo`**. Do **not** deploy to live (`nonaymiwdayfuulccxrl`) from these steps. Use a **test** secret, never the live one.

## 1. Set a test secret on staging
```bash
supabase secrets set LEAD_WEBHOOK_SECRET=<test-secret-at-least-24-chars> --project-ref jiencxiapucrexpmzxbo
```

## 2. Deploy the function to staging only
It authenticates with its own shared secret, so ad platforms send no Supabase login:
```bash
supabase functions deploy receive-lead-webhook --project-ref jiencxiapucrexpmzxbo --no-verify-jwt
```

## 3. Requests and expected results
Base URL: `https://jiencxiapucrexpmzxbo.supabase.co/functions/v1/receive-lead-webhook`. Use synthetic data only.

| # | Request | Expected |
|---|---|---|
| a | No `x-webhook-secret` header | **401** `{"error":"Unauthorized"}`; nothing stored |
| b | Correct secret, `age_confirmed` missing | **422**; nothing stored |
| c | Correct secret, `age_confirmed: true`, no email and no phone | **400** «At least email or phone is required» |
| d | Correct secret, Facebook body (below) | **200** `{"success":true,"lead_id":"…"}` |
| e | Same as d with header `x-source: linkedin` and `"company":"Δοκιμή ΑΕ"` | **200**; lead_type `B2B` |

Request d:
```bash
curl -s -X POST "https://jiencxiapucrexpmzxbo.supabase.co/functions/v1/receive-lead-webhook" \
  -H "Content-Type: application/json" -H "x-webhook-secret: <test-secret>" -H "x-source: facebook" \
  -d '{"first_name":"Δοκιμή","last_name":"Webhook","phone":"6900000000","email":"webhook.test@example.invalid","age_confirmed":true,"consent":true,"campaign":"Staging test","custom_questions":{"kwh":"300"}}'
```

## 4. Check in the staging CRM (Leads)
- The lead appears in **Leads → Νέο** as «Δοκιμή Webhook».
- Source «Καμπάνια», label «Facebook Lead Ads», campaign «Staging test».
- The comment holds the form answers.
- Consent is recorded only because `consent: true` was sent. Repeat d without `consent`: the lead is stored with consent **false**.
- **No** voice call or other message is triggered.
- `activity_log` has one `created` row with `via: webhook`.

## 5. Clean up
Move the test leads to the Κάδος in staging. Rotate or remove the test secret if the staging project is shared.
