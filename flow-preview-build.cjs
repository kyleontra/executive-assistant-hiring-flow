const { readFileSync, writeFileSync, mkdirSync } = require('node:fs');
const { resolve } = require('node:path');
const files = ['candidate-login', 'candidate-signup', 'check-email', 'email-confirmed', 'candidate-resume', 'candidate-next-steps', 'candidate-profile', 'id-verification', 'verification', 'candidate-dashboard', 'referral', 'reset-password'];
module.exports = function buildFlowPreview(root) {
  const out = resolve(root, 'dist/flow-preview');
  mkdirSync(out, { recursive: true });
  for (const file of files) {
    let html = readFileSync(resolve(root, `dist/${file}.html`), 'utf8');
    html = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<link\b[^>]*rel="modulepreload"[^>]*>/gi, '')
      .replace(/<meta\b[^>]*http-equiv="refresh"[^>]*>/gi, '')
      .replace(/<a\b([^>]*?)href="[^"]*"([^>]*)>/gi, '<a $1href="#"$2>')
      .replace(/\s(?:autofocus|autoplay)(?=[\s>])/gi, '')
      .replace(/<input\b/g, '<input disabled')
      .replace('<head>', '<head><base href="/" /><meta name="robots" content="noindex,nofollow" /><meta http-equiv="Content-Security-Policy" content="script-src \'none\'; connect-src \'none\'; form-action \'none\'; object-src \'none\'" />');
    writeFileSync(resolve(out, `${file}.html`), html);
  }
};
