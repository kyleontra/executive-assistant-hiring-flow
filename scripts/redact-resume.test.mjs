import assert from 'node:assert/strict';
import test from 'node:test';
import { redactContactInfo } from '../supabase/functions/_shared/redact-contact-info.mjs';
import { indexResume, resumeIndexColumns, RESUME_INDEX_VERSION } from '../supabase/functions/_shared/resume-index.mjs';

test('redacts email addresses and South African phone numbers', () => {
  const result = redactContactInfo('Email jane.doe+jobs@example.co.za or call +27 82 123 4567 / (021) 555-0199.');
  assert.equal(result, 'Email [EMAIL REDACTED] or call [PHONE REDACTED] / [PHONE REDACTED].');
});

test('does not redact ordinary years and numeric ranges', () => {
  const value = 'Executive Assistant from 2018 - 2023. Managed 6 calendars and 25 meetings.';
  assert.equal(redactContactInfo(value), value);
});

test('redacts email addresses split across extracted PDF lines', () => {
  const result = redactContactInfo('Email: candidate@gmai\nl.com or clientservices@example.c\nom');
  assert.equal(result, 'Email: [EMAIL REDACTED] or [EMAIL REDACTED]');
});

test('indexes roles, software, skills, industries and experience from redacted resume text', () => {
  const index = indexResume(`
    PROFESSIONAL SUMMARY
    Senior Paralegal with extensive litigation support and case management experience for international legal teams.

    Senior Paralegal | Mokoena Legal Partners | 2020 - Present
    Conduct legal research, document review, legal drafting, client intake, and contract management.
    Software: Clio, LexisNexis, Westlaw, Microsoft Excel, DocuSign and Google Workspace.

    Legal Assistant | Cape Advisory Law | 2017 - 2020
    EDUCATION
    LLB, University of Cape Town
    CERTIFICATIONS
    Certified Paralegal Certificate
    LANGUAGES
    English, Afrikaans
  `);
  assert.deepEqual(index.jobTitles, ['Senior Paralegal', 'Paralegal', 'Legal Assistant']);
  assert.ok(index.software.includes('Clio'));
  assert.ok(index.software.includes('Microsoft Excel'));
  assert.ok(index.skills.includes('Legal research'));
  assert.ok(index.skills.includes('Case management'));
  assert.ok(index.industries.includes('Legal services'));
  assert.ok(index.companies.includes('Mokoena Legal Partners'));
  assert.ok(index.education.some((value) => value.includes('University of Cape Town')));
  assert.ok(index.certifications.some((value) => value.includes('Certified Paralegal')));
  assert.deepEqual(index.languages, ['English', 'Afrikaans']);
  assert.ok(index.yearsExperience >= 8);
  assert.match(index.searchText, /Senior Paralegal/);
});

test('maps a resume index to private database columns with a version and timestamp', () => {
  const columns = resumeIndexColumns(indexResume('Executive Assistant | Atlas Group | 2021 - Present\nCalendar management using Outlook and Asana.'), '2026-09-01T12:00:00.000Z');
  assert.equal(columns.resume_index_version, RESUME_INDEX_VERSION);
  assert.equal(columns.resume_indexed_at, '2026-09-01T12:00:00.000Z');
  assert.ok(columns.resume_job_titles.includes('Executive Assistant'));
  assert.ok(columns.resume_software.includes('Microsoft Outlook'));
  assert.ok(columns.resume_search_text.length > 0);
});

test('does not treat education-only credentials as work titles or inflate overlapping experience', () => {
  const index = indexResume(`
    PROFESSIONAL SUMMARY
    Client success professional with experience managing remote customer portfolios, escalations, SLA reporting, and renewals.
    PROFESSIONAL EXPERIENCE
    Client Success Manager | Inflow Marketing | Nov 2025 - Present
    Call Center Manager | Apex Dental Marketing | Jul 2025 - Dec 2025
    Customer Service Representative | Insurance Supermarket Inc. | Oct 2018 - Dec 2019
    EDUCATION
    South African Law School | Conveyancing Paralegal | Aug 2023 - May 2024
    ALX Virtual Assistant Program | Certificate of Completion
    SOFTWARE
    GoHighLevel, Salesforce, OneDrive, Calendly
  `);
  assert.ok(index.jobTitles.includes('Client Success Manager'));
  assert.ok(index.jobTitles.includes('Call Center Manager'));
  assert.ok(!index.jobTitles.includes('Paralegal'));
  assert.ok(index.software.includes('GoHighLevel'));
  assert.ok(index.software.includes('Calendly'));
  assert.ok(index.yearsExperience < 4);
  assert.ok(index.yearsExperience > 1);
});

test('recognizes customer-service roles and South African language variants', () => {
  const index = indexResume(`
    PROFESSIONAL SUMMARY
    Customer service professional supporting healthcare, energy, and e-commerce customers.
    WORK HISTORY
    Oct 2023 - Jul 2024 Customer service agent
    Clipboard Health
    Feb 2022 - Dec 2022 Customer service agent
    WNS Global Services
    Jul 2020 - Oct 2021 Customer service agent
    Customer Care Solutions
    EDUCATION
    Diploma, Cape Peninsula University of Technology
    LANGUAGES
    English and IsiXhosa
  `);
  assert.deepEqual(index.jobTitles, ['Customer Service Agent']);
  assert.ok(index.companies.includes('Clipboard Health'));
  assert.deepEqual(index.languages, ['English', 'IsiXhosa']);
  assert.ok(index.yearsExperience >= 3);
  assert.ok(index.yearsExperience < 5);
});

test('extracts dated work history from the stored resume without inventing dates or copying contact details', () => {
  const index = indexResume(`
    PROFESSIONAL EXPERIENCE
    Sales Representative
    Atlas Sales Apr 2026 — May 2026
    Followed up with leads via phone and email
    Reason for leaving: private family matter
    Client Success Manager | North Studio — Remote Nov 2025 – Present
    • Improved onboarding for client accounts
    • Maintained accurate CRM records
    Oct 2023 - Jul 2024 Customer Service Agent
    Care Solutions
    Resolved customer questions in live chat
    Customer Service Representative | Insurance Supermarket Inc. — Miami, USA (Remote) Oct 2018 - Dec 2019
    Resolved account questions
    EDUCATION
    College | Jan 2018 - Dec 2020
  `);
  assert.equal(index.experience.length, 4);
  assert.deepEqual(index.experience.map(({ jobTitle, companyName, startDate, endDate, currentRole }) => ({ jobTitle, companyName, startDate, endDate, currentRole })), [
    { jobTitle: 'Sales Representative', companyName: 'Atlas Sales', startDate: '2026-04', endDate: '2026-05', currentRole: false },
    { jobTitle: 'Client Success Manager', companyName: 'North Studio', startDate: '2025-11', endDate: '', currentRole: true },
    { jobTitle: 'Customer Service Agent', companyName: 'Care Solutions', startDate: '2023-10', endDate: '2024-07', currentRole: false },
    { jobTitle: 'Customer Service Representative', companyName: 'Insurance Supermarket Inc', startDate: '2018-10', endDate: '2019-12', currentRole: false },
  ]);
  assert.match(index.experience[0].description, /phone and email/);
  assert.doesNotMatch(JSON.stringify(index.experience), /private family matter|College/);
  assert.deepEqual(resumeIndexColumns(index).resume_experience, index.experience);
});

test('extracts separate title, employer and date lines without attributing team mentions to software', () => {
  const index = indexResume(`PROFESSIONAL SUMMARY
Executive assistant supporting healthcare and ecommerce teams.
WORK EXPERIENCE
Executive Assistant
Example Healthcare Team
January 2023 - Present
Managed calendars and appointments using Google Workspace and Slack.
Customer Support Specialist
Example Retail Team
January 2021 - December 2022
Resolved customer enquiries using Zendesk.
Temporary Administrative Assistant
Example Temporary Team
January 2020 - March 2020
Short temporary placement.
EDUCATION
College
January 2018 - December 2019`);
  assert.equal(index.experience.length, 3);
  assert.equal(index.experience[0].companyName, 'Example Healthcare Team');
  assert.equal(index.experience[0].startDate, '2023-01');
  assert.equal(index.experience[1].endDate, '2022-12');
  assert.doesNotMatch(index.experience[0].description, /Customer Support Specialist|Example Retail/);
  assert.equal(index.software.includes('Microsoft Teams'), false);
  for (const text of ['Microsoft Teams', 'TOOLS\nTeams\nSlack', 'TOOLS\nSlack, Teams, Zoom']) {
    assert.equal(indexResume(text).software.includes('Microsoft Teams'), true);
  }
});
