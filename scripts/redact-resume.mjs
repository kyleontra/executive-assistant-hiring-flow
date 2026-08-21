#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import { basename, extname, resolve } from 'node:path';
import WordExtractor from 'word-extractor';
import { strFromU8, unzipSync } from 'fflate';
import { extractText, getDocumentProxy } from 'unpdf';
import { redactContactInfo } from '../supabase/functions/_shared/redact-contact-info.mjs';

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
  const content = unzipSync(bytes)['content.xml'];
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

async function createRedactedResume(file, extension) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let extracted = '';
  if (extension === 'pdf') {
    const pdf = await getDocumentProxy(bytes);
    ({ text: extracted } = await extractText(pdf, { mergePages: true }));
  } else if (extension === 'doc' || extension === 'docx') {
    const extractor = new WordExtractor();
    const document = await extractor.extract(Buffer.from(bytes));
    extracted = [document.getBody(), document.getHeaders(), document.getFootnotes(), document.getEndnotes(), document.getTextboxes()].filter(Boolean).join('\n\n');
  } else if (extension === 'txt') {
    extracted = new TextDecoder().decode(bytes);
  } else if (extension === 'rtf') {
    extracted = extractRtfText(bytes);
  } else if (extension === 'odt') {
    extracted = extractOdtText(bytes);
  } else {
    throw new Error('Unsupported resume format.');
  }
  extracted = String(extracted || '').replace(/\u0000/g, '').replace(/\r\n?/g, '\n').trim();
  if (extracted.length < 40) throw new Error('Could not read enough text to redact this resume safely.');
  const notice = 'HIRE FROM SA — CONTACT DETAILS REDACTED\nPhone numbers and email addresses are hidden for candidate safety.\n\n';
  return new Blob([notice, redactContactInfo(extracted), '\n'], { type: 'text/plain;charset=utf-8' });
}

const [, , inputArg, outputArg] = process.argv;
if (!inputArg) {
  console.error('Usage: npm run redact:resume -- <resume.pdf|resume.doc|resume.docx|resume.txt|resume.rtf|resume.odt> [output.txt]');
  process.exitCode = 1;
} else {
  const inputPath = resolve(inputArg);
  const extension = extname(inputPath).slice(1).toLowerCase();
  const outputPath = resolve(outputArg || `${inputPath.slice(0, -extname(inputPath).length)}-redacted.txt`);
  const bytes = await readFile(inputPath);
  const mimeTypes = {
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    txt: 'text/plain',
    rtf: 'application/rtf',
    odt: 'application/vnd.oasis.opendocument.text',
  };
  if (!mimeTypes[extension]) throw new Error('Choose a PDF, DOC, DOCX, TXT, RTF, or ODT resume.');
  const file = new File([bytes], basename(inputPath), { type: mimeTypes[extension] });
  const redacted = await createRedactedResume(file, extension);
  await writeFile(outputPath, new Uint8Array(await redacted.arrayBuffer()));
  console.log(`Redacted resume saved to ${outputPath}`);
}
