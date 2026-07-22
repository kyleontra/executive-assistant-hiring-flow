const $ = (selector) => document.querySelector(selector);
const imageInput = $('#idImage');
let imageFile;

function setView(name) {
  $('#idleState').hidden = name !== 'idle';
  $('#processingState').hidden = name !== 'processing';
  $('#resultState').hidden = name !== 'result';
  $('#errorState').hidden = name !== 'error';
}
function luhnIsValid(value) {
  let sum = 0;
  let doubleDigit = false;
  for (let index = value.length - 1; index >= 0; index--) {
    let digit = Number(value[index]);
    if (doubleDigit) { digit *= 2; if (digit > 9) digit -= 9; }
    sum += digit;
    doubleDigit = !doubleDigit;
  }
  return sum % 10 === 0;
}
function maskId(value) { return `•••• •••• •${value.slice(-4)}`; }
function findIdNumber(text) {
  const matches = text.match(/(?:\d[\s-]?){13}/g) || [];
  return matches.map(match => match.replace(/\D/g, '')).find(match => match.length === 13) || null;
}
function updateReadButton() { $('#readId').disabled = !(imageFile && $('#consent').checked); }
function showError(message) { $('#errorText').textContent = message; setView('error'); }

imageInput.addEventListener('change', event => {
  imageFile = event.target.files?.[0];
  if (!imageFile) return;
  const preview = $('#imagePreview');
  preview.src = URL.createObjectURL(imageFile);
  preview.hidden = false;
  $('.drop-zone').hidden = true;
  updateReadButton();
});
$('#consent').addEventListener('change', updateReadButton);

$('#idForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (!imageFile || !$('#consent').checked) return;
  if (!window.Tesseract) { showError('The on-device OCR library did not load. Check your internet connection and try again.'); return; }
  setView('processing');
  $('#progressText').textContent = 'Preparing image';
  try {
    const result = await Tesseract.recognize(imageFile, 'eng', { logger: status => {
      if (status.status === 'recognizing text') $('#progressText').textContent = `Reading text ${Math.round(status.progress * 100)}%`;
      else if (status.status) $('#progressText').textContent = status.status;
    }});
    const rawText = result.data.text || '';
    const normalised = rawText.replace(/\s+/g, ' ').toUpperCase();
    const countryFound = /REPUBLIC\s+OF\s+SOUTH\s+AFRICA|SOUTH\s+AFRICA|IDENTITY\s+(CARD|DOCUMENT)/.test(normalised);
    const idNumber = findIdNumber(rawText);
    const validChecksum = idNumber ? luhnIsValid(idNumber) : false;
    $('#countrySignal').textContent = countryFound ? 'Detected' : 'Not detected';
    $('#countrySignal').className = countryFound ? 'yes' : 'no';
    $('#numberSignal').textContent = idNumber ? 'Detected' : 'Not detected';
    $('#numberSignal').className = idNumber ? 'yes' : 'no';
    $('#checksumSignal').textContent = idNumber ? (validChecksum ? 'Matches 13-digit checksum' : 'Does not match checksum') : 'No number to check';
    $('#checksumSignal').className = validChecksum ? 'yes' : 'no';
    $('#maskedId').textContent = idNumber ? maskId(idNumber) : '—';
    const passed = countryFound && Boolean(idNumber) && validChecksum;
    $('#resultTitle').textContent = passed ? 'South Africa ID test passed' : 'ID test needs a clearer image';
    $('#resultDescription').textContent = passed ? 'South Africa document text and a valid 13-digit ID-number checksum were detected. The identifier remains masked on this screen.' : 'The test did not find all required text signals. Try a brighter, sharper image of the front of the ID.';
    $('#resultBadge').textContent = passed ? 'Test passed' : 'Try again';
    setView('result');
  } catch (error) {
    showError('We could not read this image. Try a brighter photo with all printed text in focus and no glare.');
  }
});
