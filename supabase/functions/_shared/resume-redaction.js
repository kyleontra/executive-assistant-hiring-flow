import { Buffer } from 'node:buffer';
import { strFromU8, unzipSync } from 'npm:fflate@0.8.2';
import WordExtractor from 'npm:word-extractor@1.0.4';
import { extractText, getDocumentProxy } from 'npm:unpdf@1.8.1';
import { redactContactInfo } from './redact-contact-info.mjs';

export { redactContactInfo } from './redact-contact-info.mjs';

function decodeXmlEntities(value) {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function extractOdtText(bytes) {
  const archive = unzipSync(bytes);
  const content = archive['content.xml'];
  if (!content) throw new Error('This ODT file does not contain readable document text.');
  return decodeXmlEntities(strFromU8(content)
    .replace(/<text:(?:p|h)\b[^>]*>/gi, '\n')
    .replace(/<text:line-break\s*\/?>/gi, '\n')
    .replace(/<text:tab\s*\/?>/gi, '\t')
    .replace(/<text:s(?:\s+text:c="(\d+)")?\s*\/?>/gi, (_, count) => ' '.repeat(Number(count || 1)))
    .replace(/<[^>]+>/g, ' '));
}

function extractRtfText(bytes) {
  const source = new TextDecoder('windows-1252').decode(bytes);
  return source
    .replace(/\\\r?\n/g, '\n')
    .replace(/\\'([\da-f]{2})/gi, (_, hex) => new TextDecoder('windows-1252').decode(Uint8Array.of(Number.parseInt(hex, 16))))
    .replace(/\\u(-?\d+)\??/g, (_, value) => String.fromCharCode(Number(value) < 0 ? Number(value) + 65536 : Number(value)))
    .replace(/\\(?:par|line)\b\s?/gi, '\n')
    .replace(/\\tab\b\s?/gi, '\t')
    .replace(/\\[{}\\]/g, (match) => match.slice(1))
    .replace(/\\[a-z]+-?\d*\s?/gi, '')
    .replace(/\\[^a-z]/gi, '')
    .replace(/[{}]/g, ' ');
}

export async function extractResumeText(file, extension) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (extension === 'pdf') {
    const pdf = await getDocumentProxy(bytes);
    const { text } = await extractText(pdf, { mergePages: true });
    return String(text || '');
  }
  if (extension === 'doc' || extension === 'docx') {
    const extractor = new WordExtractor();
    const document = await extractor.extract(Buffer.from(bytes));
    return [document.getBody(), document.getHeaders(), document.getFootnotes(), document.getEndnotes(), document.getTextboxes()]
      .filter(Boolean)
      .join('\n\n');
  }
  if (extension === 'txt') return new TextDecoder().decode(bytes);
  if (extension === 'rtf') return extractRtfText(bytes);
  if (extension === 'odt') return extractOdtText(bytes);
  throw new Error('Unsupported resume format.');
}

export async function createRedactedResume(file, extension) {
  const extracted = (await extractResumeText(file, extension))
    .replace(/\u0000/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
  if (extracted.length < 40) {
    throw new Error('We could not read enough text from this resume to redact it safely. Upload a text-based PDF, DOC, DOCX, TXT, RTF, or ODT file.');
  }
  const redacted = redactContactInfo(extracted);
  const notice = 'HIRE FROM SA — CONTACT DETAILS REDACTED\nPhone numbers and email addresses are hidden for candidate safety.\n\n';
  return new Blob([notice, redacted, '\n'], { type: 'text/plain;charset=utf-8' });
}
