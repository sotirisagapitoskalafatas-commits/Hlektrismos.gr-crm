# Offer links: formats, and how each behaves

## Formats that have existed
| Format | Example path | Signature | Where it existed |
|---|---|---|---|
| A, unsigned | `/functions/v1/accept-offer?lead_id=…&tariff_id=…` | none | The version running in production today. Opening the link converts the lead. |
| B, signed, no expiry | as A, plus `&t=<sig>` | HMAC, no expiry | Repository only, from the Oct 2026 audit fixes. Not the deployed version when checked on 28 and 31 Oct 2026. |
| C, signed, expiring | `<crm>/#/offer?lead_id=…&tariff_id=…&t=<exp>.<sig>` | HMAC, 14 days | PR #138 only. Never deployed. |
| D, offer record | `<crm>/#/offer?offer_id=…&lead_id=…&t=<exp>.<sig>` | HMAC over offer and lead, 14 days | This change. |

## Behaviour after this change
| Link | Opening it | Pressing «Αποδέχομαι» | Customer sees |
|---|---|---|---|
| D, valid | shows the page; nothing changes | converts, once | accepted |
| D, repeated | same | nothing changes | already accepted |
| D, past expiry | same | nothing changes | expired |
| D, replaced by a newer offer, withdrawn, or lead closed | same | nothing changes; refusal recorded in `offer_events` | not available |
| D, edited, or used with another offer or lead | same | nothing changes | invalid link |
| A, B or C for a lead and tariff with a recorded offer | redirected to the page; nothing changes | **no conversion**; a row is queued in `offer_legacy_link_reviews` | «Λάβαμε το αίτημά σας», a consultant will confirm |
| A, B or C with no recorded offer | same | nothing changes, nothing stored | offer not found |
| B or C with a forged signature | same | nothing changes, nothing stored | invalid link |

So after deployment an old link is not dead and does not fail silently, but it also no longer completes acceptance by itself. A is unsigned, so anyone who can guess or read a lead id could use it; it cannot safely convert anything.

The redirect needs `SITE_URL`. Without it the old URL answers 405 and changes nothing.

## Do this before deployment: is any old link in circulation?
Production holds no `crm_tasks`, `offer_sent` or `offer_accepted` record of an offer. That does not prove none was sent, because a task can be deleted and a send that failed part-way leaves no record. Only the providers can show it.

**Resend** (dashboard, Emails):
1. Filter by the sender `offers@hlektrismos.gr`, or the subject beginning «⚡ Νέα Προσφορά Ενέργειας».
2. Set the date range as far back as the account's log retention allows, and note that limit.
3. Record the number found, and for each one the date. Do not export recipient addresses into any repository or ticket.
4. Open one message body and confirm which format its link has: `/functions/v1/accept-offer` without `t=` is format A.

**Infobip** (Analyze, Logs):
1. Filter channels Viber and WhatsApp, and the sender `Hlektrismos` or the WhatsApp sender in use.
2. Search the message text for `accept-offer`.
3. Record count, dates and the retention limit in the same way.

**Result to record:** "N offers found between DATE and DATE; retention covers back to DATE." If N is 0 and retention covers the period since 13 Aug 2026, no link is outstanding. If retention is shorter, the earlier period stays unknown, and that should be stated.

## Decision needed from the owner
Do not mass-resend, invalidate links or change customer records without this decision. If any link is found, the options are:
1. **Keep the review queue** (implemented default). Each pressed link reaches a person. No risk of a forged conversion; a real acceptance takes a human step.
2. **Reissue individually**, for the specific customers found, through `send-offer`. Each resend is a new contact and needs the same consent check.
3. **Honour format B or C automatically** while they are unexpired or for a fixed period. Possible only for a valid signature, needs a code change, and is not applicable to format A.
