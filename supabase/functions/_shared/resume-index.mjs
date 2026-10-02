export const RESUME_INDEX_VERSION = 6;

const SOFTWARE = [
  ['Microsoft Excel', /\b(?:microsoft\s+)?excel\b/i], ['Microsoft Word', /\b(?:microsoft\s+)?word\b/i],
  ['Microsoft PowerPoint', /\b(?:microsoft\s+)?power\s*point\b/i], ['Microsoft Outlook', /\b(?:microsoft\s+)?outlook\b/i],
  ['Microsoft Teams', /\b(?:microsoft|ms)\s+teams\b|(?:^|[\n,;|])\s*teams\s*(?=$|[\n,;|])/i], ['Microsoft 365', /\b(?:microsoft|ms)\s*(?:office|365)\b/i],
  ['Google Workspace', /\bgoogle\s+(?:workspace|sheets|docs|slides|drive|calendar)\b/i], ['Slack', /\bslack\b/i],
  ['Zoom', /\bzoom\b/i], ['Salesforce', /\bsalesforce\b/i], ['HubSpot', /\bhub\s*spot\b/i],
  ['SAP', /\bSAP\b/], ['Oracle', /\boracle\b/i], ['Workday', /\bworkday\b/i],
  ['QuickBooks', /\bquick\s*books\b/i], ['Xero', /\bxero\b/i], ['Sage', /\bsage\b/i],
  ['Jira', /\bjira\b/i], ['Confluence', /\bconfluence\b/i], ['Asana', /\basana\b/i],
  ['Trello', /\btrello\b/i], ['Notion', /\bnotion\b/i], ['Monday.com', /\bmonday(?:\.com)?\b/i],
  ['ClickUp', /\bclick\s*up\b/i], ['Airtable', /\bairtable\b/i], ['Canva', /\bcanva\b/i],
  ['Adobe Acrobat', /\badobe\s+acrobat\b/i], ['Adobe Photoshop', /\b(?:adobe\s+)?photoshop\b/i],
  ['Adobe Illustrator', /\b(?:adobe\s+)?illustrator\b/i], ['Figma', /\bfigma\b/i],
  ['DocuSign', /\bdocu\s*sign\b/i], ['Dropbox', /\bdropbox\b/i], ['SharePoint', /\bshare\s*point\b/i],
  ['Zendesk', /\bzendesk\b/i], ['Intercom', /\bintercom\b/i], ['Freshdesk', /\bfreshdesk\b/i],
  ['Clio', /\bclio\b/i], ['LexisNexis', /\blexis\s*nexis\b/i], ['Westlaw', /\bwestlaw\b/i],
  ['MyCase', /\bmycase\b/i], ['PracticePanther', /\bpractice\s*panther\b/i],
  ['GoHighLevel', /\b(?:go\s*high\s*level|gohighlevel)\b/i], ['LinkedIn Sales Navigator', /\blinkedin\s+sales\s+navigator\b/i],
  ['OneDrive', /\bone\s*drive\b/i], ['Microsoft Copilot', /\b(?:microsoft\s+)?copilot\b/i], ['Microsoft To Do', /\b(?:microsoft\s+)?to[- ]?do\b/i],
  ['Caseline', /\bcaseline\b/i], ['Lexis Convey', /\blexis\s+convey\b/i], ['Tier.Net', /\btier\.net\b/i],
  ['Loom', /\bloom\b/i], ['Krisp', /\bkrisp\b/i], ['Grammarly', /\bgrammarly\b/i], ['Calendly', /\bcalendly\b/i],
  ['Vicidial', /\bvicidial\b/i], ['Carta', /\bcarta\b/i], ['DHIS', /\bDHIS\b/i], ['Claude', /\bclaude(?:\.ai)?\b/i],
  ['SQL', /\bSQL\b/], ['Python', /\bpython\b/i], ['JavaScript', /\bjava\s*script\b/i],
  ['React', /\breact(?:\.js|js)?\b/i], ['Node.js', /\bnode(?:\.js|js)\b/i], ['GitHub', /\bgithub\b/i],
  ['AWS', /\bAWS\b/], ['Microsoft Azure', /\b(?:microsoft\s+)?azure\b/i], ['Google Cloud', /\b(?:google\s+cloud|GCP)\b/i],
];

const JOB_TITLES = [
  ['Virtual Executive Assistant', /\bvirtual executive assistant\b/i], ['Legal Executive Assistant', /\b(?:executive assistant\s*\(legal\)|legal executive assistant)\b/i],
  ['Executive Assistant', /\bexecutive assistant\b/i], ['Personal Assistant', /\bpersonal assistant\b/i],
  ['Sales Administrative Assistant', /\bsales administrative assistant\b/i], ['Administrative Assistant', /\badministrative assistant\b/i], ['Virtual Assistant', /\bvirtual assistant\b/i],
  ['Legal Assistant', /\blegal assistant\b/i], ['Senior Paralegal', /\bsenior paralegal\b/i], ['Paralegal', /\bparalegal\b/i],
  ['Legal Secretary', /\blegal secretary\b/i], ['Office Manager', /\boffice manager\b/i],
  ['Operations Manager', /\boperations manager\b/i], ['Operations Coordinator', /\boperations coordinator\b/i], ['Operations Administrator', /\boperations administrator\b/i],
  ['Project Manager', /\bproject manager\b/i], ['Project Coordinator', /\bproject coordinator\b/i],
  ['Client Success Manager', /\bclient success manager\b/i], ['Customer Success Manager', /\bcustomer success manager\b/i], ['Customer Support Specialist', /\bcustomer support specialist\b/i],
  ['Customer Service Representative', /\bcustomer service representative\b/i], ['Customer Service Agent', /\bcustomer service agent\b/i], ['Call Center Manager', /\bcall cent(?:er|re) manager\b/i], ['Call Centre Consultant', /\bcall cent(?:er|re) consultant\b/i], ['Account Manager', /\baccount manager\b/i],
  ['Sales Representative', /\bsales (?:representative|consultant)\b/i], ['Business Development Manager', /\bbusiness development manager\b/i],
  ['Bookkeeper', /\bbookkeeper\b/i], ['Accountant', /\baccountant\b/i], ['Financial Analyst', /\bfinancial analyst\b/i],
  ['Sales Development Representative', /\bsales development representative\b/i], ['Customer Sales Representative', /\bcustomer sales representative\b/i], ['Appointment Setter', /\bappointment setter\b/i],
  ['Recruitment Administrator', /\brecruitment administrator\b/i], ['Recruiter', /\brecruiter\b/i], ['Human Resources Manager', /\b(?:human resources|HR) manager\b/i],
  ['Marketing Manager', /\bmarketing manager\b/i], ['Marketing Coordinator', /\bmarketing coordinator\b/i],
  ['Social Media Manager', /\bsocial media manager\b/i], ['Content Writer', /\bcontent (?:writer|specialist)\b/i],
  ['Data Analyst', /\bdata analyst\b/i], ['Business Analyst', /\bbusiness analyst\b/i], ['Software Developer', /\bsoftware (?:developer|engineer)\b/i],
  ['Marketing and Sales Specialist', /\bmarketing and sales specialist\b/i], ['Marketing Executive', /\bmarketing executive\b/i],
  ['Programme Coordinator', /\bprogramme coordinator\b/i], ['Voter Registration Official', /\bvoter registration official\b/i],
  ['Founder and President', /\bfounder and president\b/i], ['Founding Growth Operator', /\bfounding growth operator\b/i],
  ['Payments Processor', /\bpayments processor\b/i], ['Courier Driver', /\bcourier driver\b/i], ['Real Estate Agent', /\breal estate agent\b/i],
  ['E-hailing Driver', /\be-?hailing driver\b/i], ['Radio Presenter and News Anchor', /\bradio presenter\s*(?:&|and)\s*news anchor\b/i],
  ['Tutor', /\btutor\b/i], ['Transcriber', /\btranscriber\b/i], ['Office Clerk', /\boffice clerk\b/i],
  ['Public Relations Intern', /\bpublic relations intern\b/i], ['Graphic Designer', /\bgraphic designer\b/i], ['Receptionist', /\breceptionist\b/i],
];

const SKILLS = [
  ['Calendar management', /\bcalendar (?:management|coordination|scheduling)\b/i], ['Inbox management', /\binbox management\b/i],
  ['Travel coordination', /\btravel (?:coordination|planning|arrangements?|management)\b/i], ['Meeting coordination', /\bmeeting (?:coordination|planning|scheduling)\b/i],
  ['Project management', /\bproject management\b/i], ['Event planning', /\bevent (?:planning|coordination|management)\b/i],
  ['Bookkeeping', /\bbookkeeping\b/i], ['Payroll', /\bpayroll\b/i], ['Invoicing', /\binvoic(?:e|es|ing)\b/i],
  ['Legal research', /\blegal research\b/i], ['Legal drafting', /\blegal drafting\b/i], ['Document review', /\bdocument review\b/i],
  ['Case management', /\bcase management\b/i], ['Contract management', /\bcontract management\b/i], ['Client intake', /\bclient intake\b/i],
  ['Customer support', /\bcustomer (?:support|service|care)\b/i], ['CRM management', /\bCRM(?: management)?\b/i],
  ['Client relationship management', /\bclient relationship management\b/i], ['Customer success', /\bcustomer success\b/i], ['Escalation management', /\bescalation (?:handling|management|point)\b/i],
  ['SLA tracking', /\bSLA (?:tracking|adherence)\b/i], ['Upselling and renewals', /\b(?:upsell|renewal)s?\b/i], ['Lead generation', /\blead generation|generating leads\b/i],
  ['Cold calling', /\bcold[- ]calling\b/i], ['Appointment setting', /\bappointment setting\b/i], ['Sales operations', /\bsales operations\b/i],
  ['Email management', /\bemail management|managing email inbox\b/i], ['Data entry', /\bdata entry|data capturing\b/i], ['Record keeping', /\brecord keeping|maintain(?:ing)? (?:detailed )?records\b/i],
  ['Fundraising', /\bfund[- ]?raising\b/i], ['Budget management', /\b(?:budget|financial) management\b/i], ['Market research', /\bmarket research\b/i],
  ['Data analysis', /\bdata analys(?:is|tics)\b/i], ['Reporting', /\breporting\b/i], ['Research', /\bresearch\b/i],
  ['Process improvement', /\bprocess (?:improvement|optimisation|optimization)\b/i], ['Workflow automation', /\b(?:workflow|process) automation\b/i],
  ['Recruitment', /\brecruit(?:ment|ing)\b/i], ['Onboarding', /\bonboarding\b/i], ['Social media management', /\bsocial media management\b/i],
  ['Content creation', /\bcontent creation\b/i], ['SEO', /\bSEO\b/], ['Copywriting', /\bcopywriting\b/i],
  ['Stakeholder management', /\bstakeholder management\b/i], ['Vendor management', /\bvendor management\b/i],
  ['Written communication', /\bwritten communication\b/i], ['Problem solving', /\bproblem[- ]solving\b/i], ['Attention to detail', /\battention to detail\b/i],
];

const INDUSTRIES = [
  ['Legal services', /\b(?:law firm|legal services?|litigation|court|attorney|paralegal)\b/i],
  ['Financial services', /\b(?:financial services?|banking|fintech|investment|insurance)\b/i],
  ['Healthcare', /\b(?:healthcare|medical|clinic|hospital|patient)\b/i],
  ['Technology', /\b(?:technology|software|SaaS|IT services?)\b/i],
  ['Professional services', /\bprofessional services\b/i], ['Real estate', /\breal estate|property management\b/i],
  ['E-commerce', /\be-?commerce|online retail\b/i], ['Retail', /\bretail\b/i], ['Education', /\beducation|school|university|college\b/i],
  ['Nonprofit', /\bnon-?profit|NGO\b/i], ['Hospitality', /\bhospitality|hotel|tourism\b/i],
  ['Construction', /\bconstruction|engineering firm\b/i], ['Marketing and advertising', /\bmarketing agency|advertising\b/i],
];

const LANGUAGES = [
  ['English', /\bEnglish\b/i], ['Afrikaans', /\bAfrikaans\b/i], ['Zulu', /\b(?:isi)?Zulu\b/i], ['IsiXhosa', /\b(?:isi)?Xhosa\b/i],
  ['Sesotho', /\bSesotho\b/i], ['Setswana', /\bSetswana\b/i], ['Sepedi', /\bSepedi\b/i], ['Tsonga', /\bTsonga\b/i],
  ['Venda', /\bVenda\b/i], ['Ndebele', /\bNdebele\b/i], ['Portuguese', /\bPortuguese\b/i], ['French', /\bFrench\b/i],
  ['German', /\bGerman\b/i], ['Spanish', /\bSpanish\b/i], ['Dutch', /\bDutch\b/i], ['Arabic', /\bArabic\b/i],
];
const STOPWORDS = new Set('about above after again against all also and any are because been before being between both but can could did does doing down during each few for from further had has have having her here hers herself him himself his how into its itself just more most other our ours ourselves out over own same she should some such than that the their theirs them themselves then there these they this those through too under until very was were what when where which while who whom why will with would you your yours yourself themselves work working worked role roles experience experienced responsibilities responsibility skills skill including using used use years year'.split(/\s+/));
const SECTION = /^(?:experience|employment|work history|education|skills|technical skills|software|tools|certifications?|languages?|profile|summary|references?)\s*:?$/i;
const DATE = /\b(?:19|20)\d{2}\b|\b(?:present|current)\b/i;
const MONTHS = { jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11 };
const MONTH_PATTERN = 'Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?';

function cleanText(value, max = 160) {
  return String(value || '').replace(/\s+/g, ' ').replace(/^[\s|•·,:;–—-]+|[\s|•·,:;–—-]+$/g, '').trim().slice(0, max);
}

function unique(values, limit = 50) {
  const seen = new Set();
  return values.map((value) => cleanText(value)).filter((value) => {
    const key = value.toLowerCase();
    if (!value || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, limit);
}

function catalogMatches(text, catalog) {
  return catalog.map(([label, pattern]) => ({ label, position: text.search(pattern) }))
    .filter((match) => match.position >= 0)
    .sort((left, right) => left.position - right.position)
    .map((match) => match.label);
}

function sectionName(line) {
  const normalized = cleanText(line, 80).toLowerCase().replace(/[^a-z]/g, '');
  if (/^(?:professionalexperience|workexperience|workhistory|employmenthistory|experience)$/.test(normalized)) return 'experience';
  if (/^(?:education|educationeducation|academicbackground)$/.test(normalized)) return 'education';
  if (/^(?:certification|certifications|qualification|qualifications)$/.test(normalized)) return 'certifications';
  if (/^(?:skills|technicalskills|coreskills|corecompetencies|certificationsskills)$/.test(normalized)) return 'skills';
  if (/^(?:language|languages)$/.test(normalized)) return 'languages';
  if (/^(?:reference|references)$/.test(normalized)) return 'references';
  if (/^(?:profile|summary|professionalsummary|careersummary|aboutme)$/.test(normalized)) return 'summary';
  if (/^(?:projects|project)$/.test(normalized)) return 'projects';
  return '';
}

function annotateSections(lines) {
  let section = '';
  return lines.map((line) => {
    const heading = sectionName(line);
    if (heading) section = heading;
    return { line, heading, section };
  });
}

function extractJobTitles(annotated) {
  const matches = [];
  for (const { line, section } of annotated) {
    if (section === 'education' || section === 'certifications' || section === 'languages') continue;
    matches.push(...catalogMatches(line, JOB_TITLES));
  }
  return unique(matches, 30);
}

function plausibleCompany(value) {
  const company = cleanText(value, 120).replace(/\s+(?:—|–|-|\|)\s*(?:remote|[A-Z][a-z]+,?\s+(?:USA|South Africa)).*$/i, '');
  if (!company || company.split(/\s+/).length > 12 || SECTION.test(company) || DATE.test(company)) return '';
  if (/\b(?:certificate|completion|competenc|contact me|provide|proven|excelling|support|ability|responsibilit|summary|skills|education|present)\b/i.test(company)) return '';
  if (/[.!?]$/.test(company) || company.length > 100) return '';
  return company;
}

function extractCompanies(lines, titlePatterns) {
  const companies = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const hasTitle = titlePatterns.some(([, pattern]) => pattern.test(line));
    const parts = line.split(/\s+(?:\||•|·|–|—)\s+/).map((part) => cleanText(part, 120)).filter(Boolean);
    if (hasTitle && parts.length > 1) {
      companies.push(...parts.filter((part) => !titlePatterns.some(([, pattern]) => pattern.test(part))).map(plausibleCompany).filter(Boolean));
    }
    if (hasTitle) {
      const next = cleanText(lines[index + 1], 120);
      const candidate = plausibleCompany(next);
      if (candidate && !titlePatterns.some(([, pattern]) => pattern.test(candidate))) companies.push(candidate);
    }
  }
  return unique(companies, 25);
}

function extractEducation(annotated) {
  return unique(annotated.filter(({ line, section }) => section === 'education'
    && !sectionName(line)
    && /\b(?:bachelor|master|doctorate|diploma|degree|b\.?com|b\.?a\.?|b\.?sc|mba|llb|llm|university|college|academy|school|NQF|programme|course|training)\b/i.test(line)
    && !/\b(?:proven ability|tutoring|students|outreach|events|responsibilit)\b/i.test(line))
    .map(({ line }) => line), 20);
}

function extractCertifications(annotated) {
  return unique(annotated.filter(({ line, section }) => !sectionName(line)
    && (section === 'certifications' || /\b(?:certified|certification|certificate|licen[cs]e|PMP|CAPM|CIPD|SHRM|TEFL|TOEFL)\b/i.test(line)))
    .map(({ line }) => line), 20);
}

function extractKeywords(text) {
  const counts = new Map();
  const words = text.toLowerCase().match(/[a-z][a-z0-9+#.-]{2,}/g) || [];
  for (const raw of words) {
    const word = raw.replace(/^[.-]+|[.-]+$/g, '');
    if (word.length < 3 || word.length > 32 || STOPWORDS.has(word) || /^\d+$/.test(word) || word.includes('redacted')) continue;
    counts.set(word, (counts.get(word) || 0) + 1);
  }
  return [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])).slice(0, 40).map(([word]) => word);
}

function monthNumber(value) {
  return MONTHS[String(value || '').toLowerCase().slice(0, 9)];
}

function estimateYears(annotated) {
  const ranges = [];
  const current = new Date();
  const currentMonth = current.getUTCFullYear() * 12 + current.getUTCMonth();
  const eligible = annotated.filter(({ section }) => !['education', 'certifications', 'languages', 'skills'].includes(section));
  const text = eligible.map(({ line }) => line).join('\n');
  const patterns = [
    new RegExp(`\\b(${MONTH_PATTERN})\\s+((?:19|20)\\d{2})\\s*(?:-|–|—|to)\\s*(?:(?:(${MONTH_PATTERN})\\s+)?((?:19|20)\\d{2})|present|current)`, 'gi'),
    new RegExp(`\\b((?:19|20)\\d{2})\\s+(${MONTH_PATTERN})\\s*(?:-|–|—|to)\\s*(?:((?:19|20)\\d{2})\\s+(${MONTH_PATTERN})|present|current)`, 'gi'),
    /\b((?:19|20)\d{2})\s*(?:-|–|—|to)\s*(?:(\b(?:19|20)\d{2}\b)|present|current)\b/gi,
  ];
  for (const [patternIndex, pattern] of patterns.entries()) {
    for (const match of text.matchAll(pattern)) {
      let start;
      let end;
      if (patternIndex === 0) {
        start = Number(match[2]) * 12 + monthNumber(match[1]);
        end = match[4] ? Number(match[4]) * 12 + (match[3] ? monthNumber(match[3]) : 11) : currentMonth;
      } else if (patternIndex === 1) {
        start = Number(match[1]) * 12 + monthNumber(match[2]);
        end = match[3] ? Number(match[3]) * 12 + monthNumber(match[4]) : currentMonth;
      } else {
        start = Number(match[1]) * 12;
        end = match[2] ? Number(match[2]) * 12 + 11 : currentMonth;
      }
      if (Number.isFinite(start) && Number.isFinite(end) && start >= 1960 * 12 && end >= start && end - start <= 50 * 12) ranges.push([start, end]);
    }
  }
  ranges.sort((left, right) => left[0] - right[0] || left[1] - right[1]);
  const merged = [];
  for (const range of ranges) {
    const last = merged.at(-1);
    if (last && range[0] <= last[1] + 1) last[1] = Math.max(last[1], range[1]);
    else merged.push([...range]);
  }
  const months = merged.reduce((total, [start, end]) => total + end - start + 1, 0);
  return Math.min(50, Math.round((months / 12) * 10) / 10);
}

const WORK_DATE_RANGE = new RegExp(`\\b((?:${MONTH_PATTERN})\\s+(?:19|20)\\d{2}|(?:19|20)\\d{2})\\s*(?:-|–|—|to)\\s*((?:(?:${MONTH_PATTERN})\\s+)?(?:19|20)\\d{2}|present|current)\\b`, 'i');
function workDate(value) {
  const match = String(value || '').match(new RegExp(`\\b(${MONTH_PATTERN})\\s+((?:19|20)\\d{2})\\b`, 'i'));
  if (match) return `${match[2]}-${String(monthNumber(match[1]) + 1).padStart(2, '0')}`;
  const year = String(value || '').match(/\b((?:19|20)\d{2})\b/);
  return year ? year[1] : '';
}
function cleanWorkCompany(value) {
  const company = cleanText(value, 120)
    .replace(/\s+[—–-]\s+(?:remote|[A-Z][a-z]+.*)$/i, '')
    .replace(/\s*\((?:remote|hybrid|onsite)\)\s*$/i, '')
    .replace(/\b(Inc|Ltd|Co)\.$/i, '$1')
    .trim();
  return plausibleCompany(company);
}
function splitWorkHeader(prefix, previousLine) {
  const bar = prefix.indexOf('|');
  if (bar >= 0) {
    const title = cleanText(prefix.slice(0, bar), 100);
    const company = cleanWorkCompany(prefix.slice(bar + 1));
    if (title && title.length <= 100 && company) return { jobTitle: title, companyName: company, titleOnPreviousLine: false };
  }
  const matchingTitle = JOB_TITLES.map(([label, pattern]) => ({ label, match: prefix.match(pattern) }))
    .filter(({ match }) => match && match.index === 0)
    .sort((a, b) => b.match[0].length - a.match[0].length)[0];
  if (matchingTitle) {
    const title = cleanText(matchingTitle.match[0], 100);
    const company = cleanWorkCompany(prefix.slice(matchingTitle.match[0].length));
    if (company) return { jobTitle: title, companyName: company, titleOnPreviousLine: false };
  }
  const title = cleanText(previousLine, 100);
  const company = cleanWorkCompany(prefix);
  if (!title || title.length > 80 || !company || sectionName(title) || DATE.test(title) || /[.!?]$/.test(title) || /(?:phone|email|redacted|https?:\/\/|@)/i.test(title)) return null;
  return { jobTitle: title, companyName: company, titleOnPreviousLine: true };
}
function extractWorkExperience(annotated) {
  const anchors = [];
  for (let index = 0; index < annotated.length; index += 1) {
    const item = annotated[index];
    if (item.section !== 'experience' || item.heading) continue;
    const next = annotated[index + 1]?.line || '';
    const line = /[-–—]\s*$/.test(item.line) && /^(?:present|current)$/i.test(next) ? `${item.line} ${next}` : item.line;
    const dateRange = line.match(WORK_DATE_RANGE);
    if (!dateRange) continue;
    const prefix = line.slice(0, dateRange.index).trim();
    let header = splitWorkHeader(prefix, annotated[index - 1]?.line || '');
    let companyOnNextLine = false;
    if (!header && !prefix) {
      // Many resumes put the title, employer and dates on separate lines.
      const titleItem = annotated[index - 2];
      const companyItem = annotated[index - 1];
      const title = cleanText(titleItem?.line, 100);
      const company = cleanWorkCompany(companyItem?.line);
      if (titleItem?.section === 'experience' && !titleItem.heading &&
          companyItem?.section === 'experience' && !companyItem.heading &&
          title && title.length <= 80 && JOB_TITLES.some(([, pattern]) => pattern.test(title)) &&
          company && !JOB_TITLES.some(([, pattern]) => pattern.test(company))) {
        header = { jobTitle: title, companyName: company, titleOnPreviousLine: true, titleOffset: 2 };
      }
    }
    if (!header && !prefix) {
      const title = cleanText(line.slice(dateRange.index + dateRange[0].length), 100);
      const company = cleanWorkCompany(next);
      if (title && title.length <= 80 && JOB_TITLES.some(([, pattern]) => pattern.test(title)) && company && !DATE.test(company) && !sectionName(company)) {
        header = { jobTitle: title, companyName: company, titleOnPreviousLine: false };
        companyOnNextLine = true;
      }
    }
    if (!header) continue;
    const startDate = workDate(dateRange[1]);
    const currentRole = /^(?:present|current)$/i.test(dateRange[2]);
    const endDate = currentRole ? '' : workDate(dateRange[2]);
    if (!startDate || (!currentRole && !endDate)) continue;
    anchors.push({ index, endIndex: companyOnNextLine || line !== item.line ? index + 1 : index, titleIndex: header.titleOnPreviousLine ? index - (header.titleOffset || 1) : index, ...header, startDate, endDate, currentRole });
  }
  const experience = [];
  for (let index = 0; index < anchors.length && experience.length < 20; index += 1) {
    const anchor = anchors[index];
    const stop = anchors[index + 1]?.titleIndex ?? annotated.length;
    const details = [];
    for (let lineIndex = anchor.endIndex + 1; lineIndex < stop && details.join(' ').length < 320; lineIndex += 1) {
      const item = annotated[lineIndex];
      if (!item || item.section !== 'experience' || item.heading) break;
      const line = cleanText(item.line.replace(/^[•*\-]\s*/, ''), 180);
      if (!line || /(?:reason for (?:leaving|seeking)|\[.*redacted.*\]|https?:\/\/|\baddress\b|@)/i.test(line)) continue;
      details.push(line);
      if (details.length === 3) break;
    }
    const entry = { jobTitle: anchor.jobTitle, companyName: anchor.companyName, startDate: anchor.startDate, endDate: anchor.endDate, currentRole: anchor.currentRole, description: details.join(' ').slice(0, 500) };
    const key = `${entry.jobTitle}|${entry.companyName}|${entry.startDate}`.toLowerCase();
    if (!experience.some((existing) => `${existing.jobTitle}|${existing.companyName}|${existing.startDate}`.toLowerCase() === key)) experience.push(entry);
  }
  return experience;
}

function extractSummary(lines, jobTitles, skills) {
  const heading = lines.findIndex((line) => sectionName(line) === 'summary');
  if (heading >= 0) {
    const parts = [];
    for (const line of lines.slice(heading + 1, heading + 9)) {
      if (sectionName(line) && parts.length) break;
      if (!sectionName(line) && !DATE.test(line)) parts.push(line);
      if (parts.join(' ').length >= 380) break;
    }
    const summary = cleanText(parts.join(' '), 500);
    if (summary.length >= 60) return summary;
  }
  const firstLong = lines.find((line) => line.length >= 80 && !sectionName(line) && !DATE.test(line));
  if (firstLong) return cleanText(firstLong, 500);
  const role = jobTitles[0] || 'professional';
  const strengths = skills.slice(0, 4).join(', ');
  return cleanText(`Experienced ${role}${strengths ? ` with strengths in ${strengths}` : ''}.`, 500);
}

export function indexResume(resumeText) {
  const text = String(resumeText || '').replace(/\r/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, 100000);
  const rawLines = text.split(/\n/).map((line) => line.trim()).filter(Boolean);
  const lines = text.split(/\n/).map((line) => cleanText(line, 500)).filter(Boolean);
  const annotated = annotateSections(lines);
  const jobTitles = extractJobTitles(annotated);
  const software = unique(catalogMatches(text, SOFTWARE), 40);
  const skills = unique(catalogMatches(text, SKILLS), 50);
  const employmentText = annotated.filter(({ section }) => !['education', 'certifications', 'languages', 'skills'].includes(section)).map(({ line }) => line).join('\n');
  const industries = unique(catalogMatches(employmentText, INDUSTRIES), 20);
  const companies = extractCompanies(lines, JOB_TITLES);
  const education = extractEducation(annotated);
  const certifications = extractCertifications(annotated);
  const languages = LANGUAGES.filter(([, pattern]) => pattern.test(text)).map(([label]) => label);
  const keywords = extractKeywords(text);
  const summary = extractSummary(lines, jobTitles, skills);
  const yearsExperience = estimateYears(annotated);
  const experience = extractWorkExperience(annotateSections(rawLines));
  const searchText = [
    ...jobTitles, ...jobTitles, ...jobTitles,
    ...software, ...software,
    ...skills, ...skills,
    ...industries, ...companies, ...education, ...certifications, ...languages, ...keywords,
    summary, text,
  ].filter(Boolean).join(' ').slice(0, 120000);
  return { jobTitles, software, skills, industries, companies, education, certifications, languages, keywords, summary, yearsExperience, experience, searchText };
}

export function resumeIndexColumns(index, indexedAt = new Date().toISOString()) {
  return {
    resume_job_titles: index.jobTitles,
    resume_software: index.software,
    resume_skills: index.skills,
    resume_industries: index.industries,
    resume_companies: index.companies,
    resume_education: index.education,
    resume_certifications: index.certifications,
    resume_languages: index.languages,
    resume_keywords: index.keywords,
    resume_summary: index.summary,
    resume_years_experience: index.yearsExperience,
    resume_experience: index.experience,
    resume_search_text: index.searchText,
    resume_index_version: RESUME_INDEX_VERSION,
    resume_indexed_at: indexedAt,
  };
}
