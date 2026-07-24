const result = document.querySelector('#confirmationResult');
const title = document.querySelector('#confirmationTitle');
const lead = document.querySelector('#confirmationLead');
const continueButton = document.querySelector('#continueToPhotos');

async function checkConfirmation() {
  const user = await window.getVerifiedCandidate();
  if (user) {
    title.textContent = 'Your email is confirmed.';
    lead.textContent = `You are signed in as ${user.email}. Next, add clear photos of both sides of your South African ID.`;
    result.textContent = 'Email verified. Your identity review can now begin.';
    result.className = 'form-result show success';
    continueButton.hidden = false;
    return;
  }
  title.textContent = 'Confirm your email to continue.';
  lead.textContent = 'Open the Supabase email, select “Confirm your email address,” then return here. If you already clicked it, refresh this page.';
  result.textContent = 'We could not find a confirmed session yet.';
  result.className = 'form-result show error';
}

window.savaAuth.auth.onAuthStateChange(() => { window.setTimeout(checkConfirmation, 0); });
checkConfirmation();
