const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_CANDIDATE_PATTERN = /(?<![\w\d])(?:\+\s*)?\(?\d[\d\s().-]{7,}\d\)?(?![\w\d])/g;

export function redactContactInfo(value) {
  const withoutEmails = String(value || '').replace(EMAIL_PATTERN, '[EMAIL REDACTED]');
  return withoutEmails.replace(PHONE_CANDIDATE_PATTERN, (candidate) => {
    const digits = candidate.replace(/\D/g, '');
    return digits.length >= 9 && digits.length <= 15 ? '[PHONE REDACTED]' : candidate;
  });
}
