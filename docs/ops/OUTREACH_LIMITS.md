# Outbound limits (`OUTREACH_LIMITS`)

Every function that sends a message or places a call reads one Supabase secret, `OUTREACH_LIMITS`, holding JSON. **Without a complete, valid value they answer 503 and send nothing.** There are no defaults in the code: the numbers are the owner's decision. Setting this value does not enable outreach; `OUTREACH_ENABLED`, `LEGAL_APPROVAL_RECORDED` and the consent records are separate gates.

It is a secret, not a `crm_settings` row, so a compromised CRM login cannot raise its own limits.

## Shape
All values are whole numbers of at least 1. A missing field makes the whole value invalid.
```json
{
  "actions": {
    "sms":            { "requestsPerHour": 0, "messagesPerHour": 0, "messagesPerDay": 0, "orgMessagesPerDay": 0, "maxRecipients": 0 },
    "viber":          { "...": "the same five fields" },
    "whatsapp":       { "...": "the same five fields" },
    "voice":          { "...": "the same five fields" },
    "email_campaign": { "...": "the same five fields" },
    "email_direct":   { "...": "the same five fields" },
    "offer":          { "...": "the same five fields" }
  },
  "contact": {
    "phone": { "perHour": 0, "perDay": 0 },
    "email": { "perHour": 0, "perDay": 0 }
  },
  "voiceMaxCallSeconds": 0
}
```
The zeros above are placeholders and are refused as they stand.

## What each field limits
| Field | Scope | Counts |
|---|---|---|
| `requestsPerHour` | one caller, one channel | requests |
| `messagesPerHour`, `messagesPerDay` | one caller, one channel | messages or calls |
| `orgMessagesPerDay` | the whole organisation, one channel | messages or calls. **This is the figure that bounds the bill.** |
| `maxRecipients` | one request | recipients; 100 is a hard ceiling in code |
| `contact.phone` | one person, across SMS, Viber, WhatsApp **and voice calls together** | contacts, keyed by the normalised number, so the same person under two lead records counts once |
| `contact.email` | one person, across every kind of email | contacts |
| `voiceMaxCallSeconds` | one AI call, 10 to 3600 | sent to Vapi as `assistant.maxDurationSeconds`; the ceiling on what one call can cost |

## How the limits behave
- **Atomic.** The caller, organisation and person counters advance in one database transaction (`consume_rate_limits`, phase1/21b). A refusal by any one advances none.
- **Across instances.** The counters are in the database. The per-minute in-memory throttle stays as a cheap first filter only.
- **Fixed windows.** Hour and day windows reset on the boundary, so a burst across a boundary can reach twice a limit. Set figures with that in mind.
- **Fail closed.** If the counter cannot be reached, nothing is sent (503).
- **Provider failures are not refunded.** The provider may have accepted the message, so the count errs towards sending less.
- **Retries.** A campaign send holds a claim per lead. A provider error releases it so a retry can send; a network failure keeps it, because the outcome is unknown. Without a campaign, the same text to the same person is sent once in ten minutes.
- **Frequency cap.** The gate also counts sent messages and calls from `communication_log`, so all channels share `maxAttemptsPerWindow` (2 in 7 days, `_shared/eligibility.ts`).
- Voice calls also keep a ten-minute lock per lead.
