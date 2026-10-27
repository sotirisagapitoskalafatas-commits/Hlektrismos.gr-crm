/* AI transparency for the public chatbot (EU AI Act art. 50(1)): the visitor
   is told up front that they are talking to an AI system, and a direct
   question about its identity always gets a truthful answer.
   Shared by the browser (src/lib/jarvis-chat.ts) and the `chat` edge function,
   so both sides use the same wording. Pure module: no imports. */

export const ASSISTANT_NAME = 'Αλέξης';

/** First message of every conversation. */
export const AI_GREETING =
  `Γεια σου! ⚡ Είμαι ο ${ASSISTANT_NAME}, ο ψηφιακός βοηθός τεχνητής νοημοσύνης (AI) της Hlektrismos.gr.\n` +
  'Πώς μπορώ να σε βοηθήσω να βρεις την κατάλληλη ενεργειακή λύση και να εξοικονομήσεις χρήματα;';

/** Fixed, truthful answer to «Είσαι AI / bot / άνθρωπος;». */
export const AI_IDENTITY_REPLY =
  `Ναι, είμαι ο ${ASSISTANT_NAME}, ψηφιακός βοηθός τεχνητής νοημοσύνης (AI) της Hlektrismos.gr, όχι άνθρωπος. ` +
  'Αν προτιμάτε να μιλήσετε με άνθρωπο, γράψτε «θέλω κλήση από σύμβουλο» ή καλέστε μας στο +30 210 22 55 000.';

/** Rules added to the model's system prompt. */
export const AI_IDENTITY_RULES = [
  `- Είσαι ο ${ASSISTANT_NAME}, ψηφιακός βοηθός τεχνητής νοημοσύνης (AI) της Hlektrismos.gr. Δεν είσαι άνθρωπος ούτε υπάλληλος.`,
  '- Μην ισχυριστείς ποτέ ότι είσαι άνθρωπος, ζωντανός υπάλληλος ή πραγματικό πρόσωπο.',
  `- Αν σε ρωτήσουν αν είσαι AI, bot, chatbot, ρομπότ ή άνθρωπος, απάντησε ειλικρινά: «${AI_IDENTITY_REPLY}»`,
].join('\n');

// Strip accents and lower-case, so «Είσαι» / «ΕΙΣΑΙ» / «εισαι» all match.
const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/* Direct questions about who/what the assistant is, e.g. «Είσαι AI ή chatbot;»,
   «είσαι άνθρωπος;», «μιλάω με bot;», «are you a bot?» (matched on folded text).
   (?<!\p{L}) / (?!\p{L}) are Unicode word edges: \b does not work for Greek. */
const WHAT = '(?:ai|a\\.i\\.|bot|chatbot|chat bot|ρομποτ|robot|μηχανη|προγραμμα|τεχνητη νοημοσυνη|ανθρωπος|ανθρωπο|αληθινος|αληθινο|πραγματικος|πραγματικο|ζωντανος|υπαλληλος)';
const IDENTITY_PATTERNS = [
  new RegExp(`(?<!\\p{L})εισαι(?!\\p{L})[^.!;?]{0,40}(?<!\\p{L})${WHAT}(?!\\p{L})`, 'u'),
  new RegExp(`(?<!\\p{L})μιλα(?:ω|με)(?!\\p{L})[^.!;?]{0,30}(?<!\\p{L})(?:με|σε)(?!\\p{L})[^.!;?]{0,20}(?<!\\p{L})${WHAT}(?!\\p{L})`, 'u'),
  /(?<!\p{L})(?:are|r) (?:you|u)(?!\p{L})[^.!?]{0,30}(?<!\p{L})(?:ai|a bot|bot|chatbot|robot|human|real person|machine)(?!\p{L})/u,
];

export function isIdentityQuestion(text: string): boolean {
  const t = fold(text);
  return IDENTITY_PATTERNS.some((re) => re.test(t));
}
