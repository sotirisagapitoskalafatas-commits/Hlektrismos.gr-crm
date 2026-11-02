/**
 * Return true only when the confirmation Edge Function explicitly reports
 * successful delivery acceptance. HTTP 200 with ok:false, a skipped response,
 * a transport error, or malformed data is not a sent confirmation.
 */
export function isLeadConfirmationDelivered(result) {
  return !result?.error && result?.data?.ok === true && !result?.data?.skipped;
}
