# Legal pages: second review (27 Oct 2026)

**Scope:** the four public legal pages and the cookie consent panel, as live on `main` `53d720d`, compared with the code.
**Status:** proposed changes for owner and Greek counsel review. Not a compliance statement.

## 1. Claim-by-claim assessment of the live text (`53d720d`)

| # | Live claim | Assessment | Change in this branch |
|---|---|---|---|
| P1 | Controller: HLEKTRISMOS.GR ΜΟΝΟΠΡΟΣΩΠΗ Ι.Κ.Ε., ΑΦΜ, ΓΕΜΗ, address, info@ | Owner-supplied; not checked against ΓΕΜΗ | Kept |
| P2 | Forms: one combined list for both forms | **Incorrect detail.** The contact form has no property, region, service or file fields, and email is optional on the request form. | Split into two accurate lists |
| P3 | Chatbot text goes to Google Gemini from the first message, before any age declaration | **Verified** (`jarvis-chat.ts`, `chat/index.ts`). Material, so it stays. | Kept, in its own AI section |
| P4 | Customer case data (supply, bills, ID, signatures, photos, history) | Verified in the CRM code | Kept, rewritten as «Αν γίνετε πελάτης μας» |
| P5 | Staff: email, name, role, GPS at check-in/check-out | Accurate, but this is **employee** processing | Moved to `EMPLOYEE_PRIVACY_NOTICE_DRAFT.md` |
| P6 | Technical: IP address and User-Agent in server logs | Plausible for any host; Vercel log retention not verified | Kept, in plain wording |
| P7 | Which data are mandatory, and the consequence | **Missing** (Art. 13(2)(e)) | Added: fields marked * are needed to reply |
| P8 | «Οι αυτόματες κλήσεις AI είναι απενεργοποιημένες» | **Unverified in production** (the code gate exists; its production state is unknown) | Removed |
| P9 | «Όταν σας καλεί ο φωνητικός βοηθός, σας ενημερώνει από την αρχή ότι είναι AI και ότι η κλήση καταγράφεται» | **Unverified**: the deployed `make-voice-call` has not been compared | Removed. «η κλήση ηχογραφείται και απομαγνητοφωνείται» kept (webhook code) |
| P10 | 13-row vendor table naming Supabase, Vercel, SerpApi, OSRM… | Not required by GDPR (categories are allowed, Art. 13(1)(e)), and it exposes internal architecture | Replaced with recipient categories. The chatbot's AI provider (Google) stays **named**, because it is material. The table remains as an internal register (`PROCESSORS`, not rendered) |
| P11 | «…παρόχους, που ενεργούν για λογαριασμό μας» | **Unverified role** for every vendor (ΑΑΔΕ is a public authority) | Neutral wording, «μόνο στον βαθμό που χρειάζεται». ΑΑΔΕ listed with public authorities |
| P12 | International transfers | **Missing** since the previous PR removed the unverified DPF/SCC sentence | Added: some providers (e.g. the chatbot's AI provider) may process data outside the EEA; information on request. **Safeguards still need counsel** |
| P13 | Legal bases 6(1)(β)+(α) for requests | Kept as-is; consent and pre-contractual steps overlap | **Counsel** to choose one, then align the form checkbox |
| P14 | Retention by criteria, deletion on request | No periods were invented and no automatic deletion is claimed | Kept |
| P15 | Rights | Missing: "subject to the conditions of the law" and "withdrawal does not affect earlier processing" | Added |
| T1 | «Κάθε απόφαση για σύμβαση ελέγχεται από άνθρωπο» | **Unverified practice** | Removed |
| T2 | «Ενημερώνεστε στην αρχή κάθε κλήσης…» | **Unverified** (same as P9) | Removed; «ηχογραφούνται και απομαγνητοφωνούνται», plus the right to ask for a human or hang up, kept. **Owner to confirm** the human option |
| T3 | «δωρεάν συμβουλευτική» | Owner statement: «εντελώς δωρεάν, χωρίς καμία οικονομική επιβάρυνση» | Kept. **Owner:** supplier commissions; does Ν. 2251/1994 require disclosing them? |
| T4 | Athens courts «με την επιφύλαξη των αναγκαστικών διατάξεων» | Already qualified; not exclusive | Kept. **Counsel** to review |
| C1 | Staff storage with token and key names (`sb-*-auth-token`, `atlas.nav.collapsed`…) | Internal detail that doesn't belong on a public page | Replaced with one neutral sentence |
| C2 | «…αν ανακαλέσετε τη συγκατάθεση, δεν φορτώνεται» | **Incorrect in the live code.** Once loaded, the Speed Insights script keeps measuring until the page reloads; unmounting the component does not stop it. | **Code fix** (below) and corrected wording: «δεν αποστέλλονται πλέον μετρήσεις» |
| C3 | «Η δημόσια ιστοσελίδα δεν φορτώνει πόρους από τρίτους» | True for page browsing (live audit). Forms and chat do send data to our backend host | Clarified |
| R1 | Copyright: email procedure | Neutral, no DMCA content | Unchanged. **Counsel:** DSA Art. 16 applicability |

## 2. Consent implementation fix
- **Before:** `{choices.analytics && <SpeedInsights />}`. After «Αποδοχή» the script loaded and **kept sending** after a withdrawal, until reload. `@vercel/speed-insights@2.0.0` has no unload.
- **After:** `<SpeedInsights beforeSend={speedInsightsBeforeSend} />`. This is the package's supported hook. `speedInsightsBeforeSend` (`src/lib/consent.ts`) checks consent at send time and returns `null` (drop) once consent is withdrawn.
- **Unchanged:** default off, the stored model (`atlas.consent`, `version`, `decidedAt`, `choices.analytics`) and the three buttons.
- **Browser proof** (local production build): before a choice, no script. After «Αποδοχή», the script loads and the gate passes. **After withdrawal without a reload, the script is still present but the gate returns `null`.** After a reload, no script and no Speed Insights requests.

## 3. About the alternative "100% compliant" text
It is more readable, and listing recipients by category is legitimate. But it must not be published as-is:
- «Ψηφιακός Βοηθός: τα μηνύματα…» **hides** that the chat goes to an external AI provider from the first message. That is a material flow.
- «Στη συνέχεια διαγράφονται με ασφάλεια» promises deletion that **does not exist**.
- «…λειτουργούν αυστηρά για λογαριασμό μας, δεσμευμένοι από ρήτρες…» states vendor roles and contracts that are **unverified**.
- «υπάγεται **αποκλειστικά** στην αρμοδιότητα των δικαστηρίων των Αθηνών» may conflict with mandatory consumer jurisdiction.
- «ανεξάρτητος σύμβουλος **και μεσάζων**» describes a service model the owner has not confirmed.
- «Η τελική επιλογή… ελέγχονται… **πάντα** από εξειδικευμένο σύμβουλο» describes a practice that is unverified.
- «Το σύνολο του περιεχομένου… αποτελεί πνευματική ιδιοκτησία» claims ownership of every asset (fonts, photos) without an audit.
- It drops voice-call recording and the international-transfer information.
- Its sample React code (from the other assistant) uses a different consent schema (`performance`/`timestamp`), hand-injects a CDN script, and doesn't actually persist `theme`. Do not merge it.
- No text change makes a site "100% compliant".

## 4. Owner and counsel items still open
1. Check the company details against an official ΓΕΜΗ extract; confirm info@ handles privacy requests.
2. **Counsel:** one legal basis for request handling, and the matching form checkbox wording (currently «Συναινώ…»), kept separate from marketing consent.
3. **Counsel:** transfer safeguards per provider (Google, OpenAI, Vapi…), and wording beyond "information on request".
4. **Owner + counsel:** retention periods or more specific criteria, and an actual deletion process.
5. **Owner:** service model (adviser vs intermediary), supplier commissions, and the human option on voice calls.
6. **Verify the deployed `make-voice-call`** (greeting, AI disclosure, recording notice, refusal handling). This needs authorised access to the Hlektrismos Supabase project.
7. **Deploy the `chat` function** with the PR #108 prompt fix (separately approved).
8. **Counsel:** DSA Art. 16, consumer jurisdiction, liability clause, and whether automated decision-making information (Art. 13(2)(f)) applies.
9. Employee privacy notice: review the draft and decide on GPS proportionality and retention.
10. `POLICY_UPDATED` («1 Οκτωβρίου 2026»): set it to the actual publication date when this is published.
11. Security: staff AI API keys in `localStorage` (move server-side).
