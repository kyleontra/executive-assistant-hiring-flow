const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const WRAPPED_EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[ \t\r\n]*[A-Z0-9-](?:[\r\n]*[A-Z0-9-])*(?:[ \t\r\n]*\.[ \t\r\n]*[A-Z0-9-](?:[\r\n]*[A-Z0-9-])*)+\b/gi;
const PHONE_CANDIDATE_PATTERN = /(?<![\w\d])(?:\+\s*)?\(?\d[\d\s().-]{7,}\d\)?(?![\w\d])/g;

export function redactContactInfo(value) {
  const withoutEmails = String(value || '').replace(EMAIL_PATTERN, '[EMAIL REDACTED]').replace(WRAPPED_EMAIL_PATTERN, '[EMAIL REDACTED]');
  return withoutEmails.replace(PHONE_CANDIDATE_PATTERN, (candidate) => {
    const digits = candidate.replace(/\D/g, '');
    return digits.length >= 9 && digits.length <= 15 ? '[PHONE REDACTED]' : candidate;
  });
}
