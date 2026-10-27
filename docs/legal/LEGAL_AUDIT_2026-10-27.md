# Hlektrismos.gr: legal content audit (read-only)

**Date:** 27 October 2026  
**Code audited:** `main` at `a791aec` (the commit live on https://hlektrismos-crm.vercel.app)  
**Status:** findings for owner and legal review. This is **not** legal advice, and none of the proposed wording is approved for publication.  
**Nothing was changed:** no commit, push, merge, deployment, Supabase change, form submission or chat message.

## 0. How each claim was checked, and what could not be checked

| Evidence | Used for |
|---|---|
| Repository source on `main` (`src/`, `supabase/functions/`, `supabase/migrations/`, staged migrations) | What the code does |
| Live production site, in a clean headless Chrome profile | Cookies, local/session storage, IndexedDB and every network host across all 10 public pages: before a choice, after «Απόρριψη», and after opening the chat panel without sending anything |
| **Not checked: production Supabase Edge Function code** | The Supabase connector in this session only reaches an unrelated project (`Home88-Real-Estate's Project`), not the Hlektrismos project. |

The external "content pack" says the deployed `make-voice-call` greeting does **not** disclose AI or recording. I could not confirm or disprove that. The repository version **does** disclose both (see C-12). This needs a check by someone with access to the Hlektrismos Supabase project, for example by comparing the deployed function with the repository version.

Status legend:
- **Confirmed**: the code or a live test shows it.
- **Partial**: the code shows it, but configuration, contracts or business practice still need confirming.
- **Owner**: a fact only the business can supply.
- **Blocker**: the current text is wrong or materially incomplete, or the product behaviour must change first.

---

## 1. Legal claims audit

### 1.1 Identity and contact (all four pages, from `src/lib/legal.ts`)

| # | Claim on the live site | Evidence | Status |
|---|---|---|---|
| C-1 | Legal name, ΑΦΜ/ΔΟΥ and ΓΕΜΗ | `COMPANY.legalName/vatId/gemi` are the literal strings `TODO(owner): …` and are **visible on production** in the Privacy, Terms and Copyright pages | **Blocker / Owner** |
| C-2 | Address «Ζαλοκώστα 8, 10671 Αθήνα» | Hard-coded in `legal.ts`; nothing shows it is the registered seat | Owner |
| C-3 | +30 210 22 55 000; info@, privacy@, copyright@hlektrismos.gr | Hard-coded. Nothing in the code proves the mailboxes exist or are monitored. Note: `OfferModal` shows a different number (210 9750816). | Owner |
| C-4 | «Τελευταία ενημέρωση: 1 Οκτωβρίου 2026» | `POLICY_UPDATED` is hard-coded. The redesign went live on 27 Oct with the same text. | Partial: set only when an approved text is published |

### 1.2 Privacy Policy (`src/pages/PrivacyPolicy.tsx`)

| # | Claim | Evidence | Status |
|---|---|---|---|
| C-5 | The request form collects name, phone, email, region, property type, service, comments, optional bill files and an 18+ declaration | `LandingPage.tsx:188-203` sends exactly these fields to `insert_website_lead`. Files go to the private bucket `hlektrismos_docs` (`storage.ts`). | Confirmed. Two details to add: a placeholder email (`not-provided@hlektrismos.local`) is stored when none is given, and the **files are uploaded before the lead is created**. If the request then fails, or the visitor leaves, the files stay with no lead attached. |
| C-6 | Contact form | `ContactPage.tsx:34-44` sends name, email, phone and message with `p_source:'contact'`. One required checkbox combines «είμαι ενήλικας» with a notice that the data is used only to reply. There is no separate consent checkbox, and no `gdpr_consent` is sent. | Confirmed. The policy must not describe a separate consent here. |
| C-7 | «Οι φόρμες και το chatbot δεν αποθηκεύουν τίποτα χωρίς δήλωση ενηλικότητας» | Forms: the age check runs first in the browser (`LandingPage.tsx:157`, `ContactPage.tsx:31`) and again on the server (`insert_website_lead`, plus `age_confirmed` in `chat/index.ts:32`). **Ordinary chat:** every free-chat message, plus any phone or email the client extracts from it (`absorbVisitor` → `visitorInfo`), is sent to Google Gemini (`jarvis-chat.ts:169`, `chat/index.ts:105-138`) **with no age check**. | **Blocker.** It is accurate that nothing is *stored in our database*, but personal data does reach Google before any 18+ check. The system prompt even tells the model to «Ζήτα: όνομα, τηλέφωνο, email» during free chat (`chat/index.ts:82`). |
| C-8 | Chatbot callback stores data only after 18+ and consent | `jarvis-chat.ts:75-130` asks the 18+/consent question before collecting details; the server re-checks it (`chat/index.ts:32`) and inserts through `insert_website_lead` with `gdpr_consent:true, age_confirmed:true` | Confirmed. The «ναι» answer is not stored word for word; only booleans are. Consider storing the consent wording or version as evidence. |
| C-9 | Legal bases: 6(1)(b) for the request and offer, 6(1)(a) consent, 6(1)(c) | The landing checkbox says «Συναινώ στην επεξεργασία … για να επικοινωνήσετε μαζί μου» (`LandingPage.tsx:511`) | Owner/lawyer must choose. Consent and 6(1)(b) are both claimed for the same activity. The lawyer must pick the basis and make the checkbox wording match. |
| C-10 | Marketing email only with consent or soft opt-in; one-click unsubscribe | `send-campaign-email` uses `_shared/email-compliance.ts` (suppression check, unsubscribe link, postal address, List-Unsubscribe); there is an `unsubscribe` function | Code confirmed. **Owner:** where each campaign's recipient list comes from, and the evidence of consent. |
| C-11 | «Οι αυτόματες κλήσεις AI είναι απενεργοποιημένες» | `make-voice-call:30-32` calls a central eligibility gate described as "disabled by default", requiring consent evidence, opt-out-register screening and legal approval. It fails closed. | Partial. The gate is in the code; whether it is *applied and switched off in production* depends on staged migrations and settings I could not see. |
| C-12 | «Όταν σας καλεί ο φωνητικός βοηθός, σας ενημερώνει από την αρχή ότι είναι AI και ότι η κλήση καταγράφεται» | **Repository:** `firstMessage` (`make-voice-call:137`) does disclose AI and recording and offers a human. **Production:** not verified (see §0); the external pack reports that it differs. | **Blocker until production is checked.** Also: recording runs from the first second. If the person refuses recording, the call ends, but the refusal itself is already recorded and transcribed (`vapi-webhook:76-106`). The policy should say this. The prompt also says «ΜΗΝ ακούγεσαι σαν robot … σαν φυσικός άνθρωπος» (`make-voice-call:126`). That is allowed only if the disclosure is reliably made. |
| C-13 | Call recordings and transcripts | `vapi-webhook` stores `recording_url` and the full transcript on `voice_calls`, and copies the transcript into `lead_notes` | Confirmed. That is two copies inside the CRM, plus whatever Vapi keeps. No deletion schedule exists. |
| C-14 | Recipients table (`PROCESSORS`) | Compared with the code: <br>• **Azure is missing.** Vapi calls use `voice: { provider: "azure", voiceId: "el-GR-NestorasNeural" }` (`make-voice-call:131`), so Microsoft or Vapi's Azure account handles the speech. <br>• **OpenAI is listed as «Μόνο εντός CRM».** It is also the model *inside every voice call* (`make-voice-call:104`), so it receives what the person says. <br>• **Google is listed as «Chatbot· CRM».** Correct, but the policy text implies nothing is sent before the age gate (C-7). <br>• Every row is presented as acting «για λογαριασμό μας». ΑΑΔΕ is a public authority, not a processor. | **Blocker** (missing recipient and wrong scope). Each vendor's legal entity, role, DPA and transfer basis is **Owner**. |
| C-15 | «Η διαβίβαση γίνεται βάσει του EU-US Data Privacy Framework ή Τυποποιημένων Συμβατικών Ρητρών» | Nothing in the repository supports this. The DPF covers only certified organisations. | Owner/lawyer: check per vendor before keeping the sentence |
| C-16 | Retention section | Shows `TODO(owner)` and `[__]` blanks. The code has **no automated retention or deletion job** for leads, files, calls or prospects. `crm_settings.security_config` contains `"consent_log_retention_days": 730`, but nothing in the code enforces it. Deletion is manual only: `purge_record`, admin-only, in a *staged* (not yet applied) migration `phase2/06`. Retention of excluded B2B prospects is explicitly marked "needs Greek privacy counsel" (`phase3/08`). | **Blocker / Owner.** Any period published must be one the system can actually honour. |
| C-17 | Staff GPS at check-in/check-out | Field-sales feature in the repository | Partial: GPS precision, when it is captured and how long it is kept are Owner questions |
| C-18 | «Δεν χρησιμοποιούμε session replay, heatmaps ή διαφημιστικά cookies» | No such SDK in `package.json` or `src`; the live audit found no such requests | Confirmed for the public site |
| C-19 | B2B data | `scrape-b2b` (SerpApi / Google Maps) feeds a review queue; `aade-lookup` queries GSIS by ΑΦΜ | Confirmed as code. The policy has no Art. 14 notice (source of the data, right to object) for sole traders or named contacts found this way. This is a lawyer item. |

### 1.3 Terms of Use (`src/pages/TermsOfUse.tsx`)

| # | Claim | Status |
|---|---|---|
| T-1 | Provider identity | Same as C-1: **Blocker** |
| T-2 | «Δεν χρεώνουμε συνδρομή … δωρεάν συμβουλευτική» | Owner: who pays Hlektrismos (supplier commission?), and whether this must be disclosed |
| T-3 | «Υποβολές χωρίς δήλωση ενηλικότητας … δεν αποθηκεύονται» | True for the forms. The chat sends text to Google before any check (C-7). |
| T-4 | «Το chatbot JARVIS … είναι συστήματα AI» | **Contradicted by the product.** The interface says «Hlektrismos AI» and the greeting says «Είμαι ο AI ενεργειακός σου σύμβουλος» (`jarvis-chat.ts:19`). But the system prompt (`chat/index.ts:73, 92, 103`) says «Είσαι ο Αλέξης, ένας **ζωντανός υπάλληλος**», «**ΠΟΤΕ μην πεις ότι είσαι AI ή chatbot**», and when asked whether it is a bot it must reply «Είμαι ο Αλέξης, σύμβουλος ενέργειας». A visitor who asks directly is therefore told something misleading. **Blocker:** this is a product fix (EU AI Act Art. 50(1), consumer law). Policy wording cannot fix it. |
| T-5 | «Κάθε απόφαση για σύμβαση ελέγχεται από άνθρωπο» | Owner: a process statement the code cannot prove |
| T-6 | «Μπορείτε να ζητήσετε άνθρωπο ή τερματισμό της κλήσης» | Repository prompt: yes (`make-voice-call:110`). Production: not verified (C-12). |
| T-7 | «Αρμόδια τα δικαστήρια Αθηνών, με την επιφύλαξη …» | Lawyer: already qualified, but needs review |
| T-8 | «Δεν υπάρχει δημόσια εγγραφή» | Consistent with earlier work (admin-only provisioning); Partial |

### 1.4 Cookies Policy (`src/pages/Cookies.tsx`) and the consent panel

**Live production results (clean profile, all 10 public pages):**

| State | HTTP cookies | localStorage | sessionStorage / IndexedDB | Network hosts |
|---|---|---|---|---|
| First visit, no choice | **none** | `theme` | none | only `hlektrismos-crm.vercel.app` (plus inline `data:` resources) |
| After «Απόρριψη» | none | `theme`, `atlas.consent` = `{"version":1,…,"choices":{"analytics":false}}` | none | first-party only; no Speed Insights script |
| Chat panel opened, nothing sent | none | unchanged | none | no new hosts |

I did not test «Αποδοχή» on production, so as not to send analytics data. Locally, Speed Insights mounts only when `choices.analytics === true` (`ConsentBanner.tsx:63`); the earlier QA (38/38) confirmed this. No Vercel Web Analytics script was loaded in any state, and `@vercel/analytics` is in `package.json` but is never imported. Whether Web Analytics is switched on in the Vercel dashboard remains an Owner check.

| # | Claim | Status |
|---|---|---|
| K-1 | «Δεν χρησιμοποιούμε cookies» | True for the public site (live). Misleading as the opening statement, because the page then lists browser storage that falls under the same rule (ePrivacy Art. 5(3) / ν. 3471/2006 Art. 4(5); the ΑΠΔΠΧ treats localStorage alike). Reword (§3). |
| K-2 | List of essential storage | **Incomplete for staff.** It is missing `labs` flags, `admin-checks`, the calendar settings key, the `HomePage` detail toggle, `crm_ai_widget_session`, the external-maps app choice, and the sessionStorage keys (role preview, names-missing flag). It is also missing **`hub_api_key` and `hlektrismos_gemini_api_key`: staff-entered Gemini API keys kept in plain localStorage** (`DashboardPage.tsx:2081`). That is a security finding as well as a disclosure one. It also does not say that `theme` is written for public visitors on first load, before any choice. |
| K-3 | Speed Insights «με … τη διεύθυνση IP που βλέπει η Vercel» | Not verified either way. Vercel's own documentation describes the data as anonymous and not linked to an IP. Use neutral wording and keep hosting logs separate. |
| K-4 | «Η δημόσια ιστοσελίδα δεν φορτώνει πόρους από τρίτους» | **Confirmed live** (first-party only). The Google Maps link on the contact page only opens when clicked; mention it as an external link. |
| K-5 | Consent mechanics (default off, three buttons, footer and page reopen it, version invalidates old choices) | Confirmed by code and live test. Keep as is. |

### 1.5 Copyright Policy (`src/pages/CopyrightPolicy.tsx`)

| # | Claim | Status |
|---|---|---|
| D-1 | Designated agent name and «Αρ. καταχώρισης US Copyright Office: TODO(owner): DMCA-xxxxxxx» | **Blocker.** It is visible on production, and nothing shows a registration exists. |
| D-2 | US-style notice («υπό την ποινή ψευδορκίας»), counter-notice, restoration in «10 έως 14 εργάσιμες» | These are US 17 U.S.C. §512 rules applied as if they were universal. The source comment cites DSA Art. 16, but the page has none of the DSA elements (statement of reasons, notice confirmation, handling without undue delay). Lawyer: is Hlektrismos a "hosting service" at all for its upload flow? Uploaded bills are private and never published. |
| D-3 | «Επαναλαμβανόμενες παραβάσεις … (δύο ή περισσότερες) απενεργοποιούνται οριστικά» | No such mechanism exists in the code. This is a policy promise; Owner/lawyer. |
| D-4 | «Αφαιρούμε … άμεσα» | No workflow exists in the code; Owner |

---

## 2. Owner checklist (every missing fact)

**Identity and service model**
1. Registered legal name and legal form (sole trader / ΙΚΕ / ΟΕ …).
2. ΑΦΜ and ΔΟΥ.
3. ΓΕΜΗ number, if registered.
4. Registered seat. Is Ζαλοκώστα 8, 10671 Αθήνα correct and suitable to publish?
5. Which phone number is correct: 210 22 55 000 or 210 9750816 (OfferModal)?
6. Are info@, privacy@ and copyright@ live and monitored, and by whom?
7. Is a DPO appointed or required?
8. Role towards energy suppliers: adviser, broker/intermediary, or agent. Who pays Hlektrismos, and is it always free for customers?
9. When does a binding relationship start? Is a form submission only a request?
10. Is human review of offers or contracts actually done every time (T-5)?

**Retention** (for each item: the period or criteria, and who deletes it)

11. Requests that did not lead to a contract.
12. Customer and case files, supply data and contracts.
13. Uploaded bills, ID documents, signatures and photos, including **orphan uploads** from abandoned forms.
14. Call recordings, transcripts and the transcript copy in `lead_notes`, plus Vapi-side retention.
15. B2B prospects, including excluded ones and suppression or objection records.
16. Campaign logs and unsubscribe records.
17. Staff GPS and visit records.
18. Server logs, the consent record, and backups.
19. Is `consent_log_retention_days: 730` a decision or a default?

**Vendors and transfers** (for each vendor: legal entity, role, DPA signed?, region, subprocessors, transfer basis)

20. Supabase. 21. Vercel, and whether Web Analytics is on in the dashboard. 22. Google (Gemini): which API tier, and whether data is used for training or retained. 23. OpenAI, directly and via Vapi. 24. Vapi. 25. **Azure / Microsoft (voice)**. 26. Resend. 27. Which SMTP provider is configured. 28. Infobip: which channels are actually used. 29. SerpApi. 30. Which of CARTO, OpenRouteService, OSRM and Photon are actually used. 31. Is the energy supplier a recipient, and is it an independent controller?

**AI and communications**

32. Is the deployed `make-voice-call` the repository version? Someone with Hlektrismos Supabase access must compare.
33. Is the voice eligibility gate (staged migration `phase3/09`) applied in production, and is AI calling actually switched off?
34. Should chat be adults-only before the first message, or open to all with a clear notice?
35. Gemini terms for chat content: retention and training use.
36. Source of campaign recipients and the evidence of consent for each channel.

**Copyright**

37. Has a US DMCA agent actually been registered? (If not, nothing about it should be published.)
38. Who handles copyright and DSA notices, and in what timeframe?
39. Rights and licences for site images, logos and photos.

---

## 3. Recommended corrections (proposals only, not verified facts)

### 3.1 Product changes needed before the text can be accurate
| # | Change | Why |
|---|---|---|
| P-1 | Rewrite the chat system prompt: remove «ζωντανός υπάλληλος», «ΠΟΤΕ μην πεις ότι είσαι AI», and the scripted denial; instruct the model to confirm that it is AI when asked; stop it asking for phone and email in free chat (send people to the callback flow) | T-4, C-7; AI Act Art. 50(1) applies from 2 Aug 2026 |
| P-2 | Show a short notice before the first chat message (AI, Google processes the text, don't share sensitive data, 18+), or gate the chat on 18+ | C-7 |
| P-3 | Check the deployed `make-voice-call` against the repository and redeploy the disclosing version if they differ (separately approved operation) | C-12 |
| P-4 | Delete orphan uploads, or upload only after the lead is created | C-5, retention |
| P-5 | Store the consent wording or version with each form and callback consent | C-8, accountability |
| P-6 | Stop storing Gemini API keys in localStorage; keep them server-side | K-2 (security) |
| P-7 | Implement whatever retention schedule the owner approves (scheduled job plus storage clean-up) before publishing periods | C-16 |
| P-8 | Pick one phone number | C-3 |

### 3.2 Text changes (draft Greek, only where the facts are confirmed)

**Cookies, §2 opening** (replaces «Δεν χρησιμοποιούμε cookies»):
> Η δημόσια ιστοσελίδα δεν τοποθετεί cookies. Χρησιμοποιεί όμως την τοπική αποθήκευση του προγράμματος περιήγησης (localStorage), μια τεχνολογία παρόμοια με τα cookies, για τα εξής απολύτως απαραίτητα στοιχεία:
> - `theme`: η εμφάνιση της σελίδας (φωτεινή/σκοτεινή). Αποθηκεύεται με την πρώτη επίσκεψη.
> - `atlas.consent`: η επιλογή σας για τη μέτρηση απόδοσης, η ημερομηνία και η έκδοση της πολιτικής. Αποθηκεύεται μόνο όταν κάνετε επιλογή.
>
> Για το εξουσιοδοτημένο προσωπικό, μετά τη σύνδεση στο CRM, αποθηκεύονται επιπλέον στοιχεία σύνδεσης (Supabase), προτιμήσεις οθόνης και ουρά ενεργειών εκτός σύνδεσης. Αυτά δεν αφορούν τους επισκέπτες της ιστοσελίδας.

(The staff key list should be generated from the code, and must not include the API keys once P-6 is done.)

**Cookies, §3 Speed Insights** (removes the unverified IP claim):
> Αν επιλέξετε «Αποδοχή», φορτώνεται το Vercel Speed Insights, που μετρά την ταχύτητα της σελίδας (Web Vitals), μαζί με τη διαδρομή της σελίδας και τον τύπο συσκευής και προγράμματος περιήγησης. Δεν τοποθετεί cookies. Αν επιλέξετε «Απόρριψη» ή ανακαλέσετε τη συγκατάθεση, δεν φορτώνεται. Ξεχωριστά από αυτό, η Vercel, ως πάροχος φιλοξενίας, επεξεργάζεται τη διεύθυνση IP και τα τεχνικά στοιχεία κάθε αιτήματος για να εξυπηρετήσει τη σελίδα και για λόγους ασφάλειας.

**Cookies, §4:** keep the current text and add «Ο σύνδεσμος προς Google Maps στη σελίδα Επικοινωνίας ανοίγει μόνο αν τον πατήσετε.»

**Privacy, chatbot paragraph** (accurate *today*; replace once P-1/P-2 change the behaviour):
> Chatbot: τα μηνύματα που γράφετε, μαζί με όσα στοιχεία αναφέρετε σε αυτά, αποστέλλονται στην Google (Gemini API) για να δημιουργηθεί απάντηση, από το πρώτο μήνυμα. Μην γράφετε ευαίσθητα στοιχεία. Στη βάση δεδομένων μας αποθηκεύονται στοιχεία μόνο αν ζητήσετε κλήση και δηλώσετε ότι είστε ενήλικας και συμφωνείτε να επικοινωνήσουμε μαζί σας.

**Privacy, voice calls** (only after P-3 is verified):
> Οι κλήσεις του φωνητικού βοηθού ηχογραφούνται και απομαγνητοφωνούνται από την αρχή. Στην αρχή της κλήσης ενημερώνεστε ότι μιλάτε με σύστημα AI και ότι η κλήση καταγράφεται. Αν ζητήσετε άνθρωπο ή αρνηθείτε την καταγραφή, η κλήση τερματίζεται. Η ηχογράφηση μέχρι εκείνη τη στιγμή διατηρείται σύμφωνα με την ενότητα «Διάρκεια διατήρησης».

**Privacy, recipients table:** add an Azure row (voice synthesis in calls). Change the OpenAI scope to «AI βοηθοί του CRM· μοντέλο συνομιλίας στις φωνητικές κλήσεις». Change the heading sentence to «…στους παρακάτω αποδέκτες. Οι περισσότεροι ενεργούν για λογαριασμό μας· η ΑΑΔΕ είναι δημόσια αρχή…», with each vendor's final role as confirmed by the owner.

**Privacy, transfers:** remove the blanket DPF/SCC sentence until each vendor's basis is confirmed, then name the basis per vendor.

**Privacy, contact form:** describe it accurately: «Φόρμα επικοινωνίας: όνομα, email, προαιρετικά τηλέφωνο, μήνυμα και δήλωση ενηλικότητας. Τα χρησιμοποιούμε μόνο για να απαντήσουμε.»

**Copyright:** replace §1–§5 with the neutral notice text from the content pack (D2 there), with **no** agent registration, no perjury wording and no 10–14-day promise until the lawyer decides.

---

## 4. Release plan: getting the legal pages ready without showing `TODO(owner)`

The pages are **already live with the placeholders**. That predates the redesign, but the redesign makes them more prominent.

1. **Owner sends facts 1–6** (identity and contacts). Provider identity is a legal requirement for any commercial website (e-commerce law, π.δ. 131/2003 Art. 4), so no wording can safely replace it. This is the fastest single fix.
2. **Add a guard test.** A unit test fails if any rendered legal page contains `TODO(owner)`, `[__]` or `xxxxxxx`. It would stop a placeholder reaching production again. It is a small code change, so it needs your approval.
3. **Small text PR A (facts already verified, no lawyer needed for accuracy):** identity fields once supplied; the cookies corrections in §3.2; the chatbot paragraph; the contact-form description; the Azure row and OpenAI scope; removing the US-DMCA registration line; a single phone number. Move retention behind the guard: until the periods are approved, remove the `[__]` sentence and leave the section with only what is true, for example «Τα δεδομένα διατηρούνται για όσο χρειάζεται για τον σκοπό τους και για όσο απαιτεί η νομοθεσία· τα συγκεκριμένα χρονικά διαστήματα ορίζονται [after counsel]». **Even this interim wording needs lawyer sign-off**, because GDPR Art. 13(2)(a) expects periods or criteria.
4. **Product PRs:** P-1/P-2 (chat disclosure), P-3 (voice check and redeploy, separately approved), then P-4 to P-7.
5. **Lawyer review** of the items in §5, then PR B with the full Privacy, Terms and Copyright texts, retention periods and the lawyer-approved legal bases.
6. **Publish:** set `POLICY_UPDATED` to the actual publication date. Bump `CONSENT_VERSION` only if the consent categories change (that re-asks everyone). Re-run the live storage and network audit and the consent QA on production.

---

## 5. Items for a Greek lawyer or privacy professional

1. Legal basis for each activity: request and offer (6(1)(b) or consent), callbacks, bill OCR, B2B discovery (legitimate-interest assessment), and voice calls. Then the matching checkbox wording (C-9).
2. Retention periods and criteria for every category in §2 (items 11–19), including the tax and commercial-law minimums.
3. Chatbot: is a notice enough, or is an 18+ gate needed before the first message? And whether the current AI-concealing prompt has created exposure under AI Act Art. 50 and consumer law (T-4).
4. Voice calls: consent and eligibility evidence, recording disclosure, recording the refusal itself, ν. 3471/2006 Art. 11 and the opt-out register (C-11, C-12).
5. B2B prospecting: Art. 14 notice to sole traders and named contacts, the source of the data, objections and suppression (C-19).
6. The role of each vendor and each international transfer (C-14, C-15), and whether the energy supplier is a separate controller.
7. Copyright: does the DSA Art. 16 notice-and-action duty apply to a service whose uploads are private? Is any US DMCA process needed? The right Greek or EU procedure and timelines (D-1 to D-4).
8. Terms: limitation-of-liability and jurisdiction wording under ν. 2251/1994; disclosure of supplier commissions; the "free" claim (T-2, T-7).
9. Whether a DPO is required (checklist item 7).
10. Wording of the service model: adviser, broker or agent (checklist item 8).

---

### Appendix: where the evidence is (on `main` at `a791aec`)
- Chat prompt: `supabase/functions/chat/index.ts:73-103`; Gemini call: `:105-140`; callback gate: `:28-56`
- Chat client: `src/lib/jarvis-chat.ts:18-27` (greeting, age prompt), `:146-175` (free chat → `chat`)
- Voice: `supabase/functions/make-voice-call/index.ts:30-44` (gate), `:103-137` (OpenAI model, Azure voice, firstMessage)
- Voice storage: `supabase/functions/vapi-webhook/index.ts:36-113`
- Landing form: `src/pages/LandingPage.tsx:152-224`, consent label `:509-512`
- Contact form: `src/pages/ContactPage.tsx:28-44`, checkbox `:129-130`
- Consent: `src/lib/consent.ts`, `src/components/ConsentBanner.tsx:63`
- Staff API keys in localStorage: `src/pages/DashboardPage.tsx:2081-2264`, `src/components/LeadDetailSlideout.tsx:111`, `src/components/CrmAiAssistantWidget.tsx:69`
- Retention: `supabase/migrations/20260818200000_create_crm_settings_table.sql:92`; `supabase/staged-migrations/phase2/06_trash_leads_customers.sql`; `phase3/08` header
- Live storage audit script: run from the session scratchpad (`qa-storage.cjs`); read-only, with no form or chat submission
