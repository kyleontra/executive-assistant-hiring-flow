import assert from 'node:assert/strict';
import test from 'node:test';
import { redactContactInfo } from '../supabase/functions/_shared/redact-contact-info.mjs';

test('redacts email addresses and South African phone numbers', () => {
  const result = redactContactInfo('Email jane.doe+jobs@example.co.za or call +27 82 123 4567 / (021) 555-0199.');
  assert.equal(result, 'Email [EMAIL REDACTED] or call [PHONE REDACTED] / [PHONE REDACTED].');
});

test('does not redact ordinary years and numeric ranges', () => {
  const value = 'Executive Assistant from 2018 - 2023. Managed 6 calendars and 25 meetings.';
  assert.equal(redactContactInfo(value), value);
});
