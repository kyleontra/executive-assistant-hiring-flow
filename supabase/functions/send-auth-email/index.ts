import { Webhook } from 'https://esm.sh/standardwebhooks@1.0.0';

const hookSecret = (Deno.env.get('SEND_EMAIL_HOOK_SECRET') || '').replace('v1,whsec_', '');
const tenantId = Deno.env.get('MS_TENANT_ID') || '';
const clientId = Deno.env.get('MS_CLIENT_ID') || '';
const clientSecret = Deno.env.get('MS_CLIENT_SECRET') || '';
const initialRefreshToken = Deno.env.get('MS_REFRESH_TOKEN') || '';
const senderAddress = Deno.env.get('MS_SENDER_ADDRESS') || 'info@hirefromsa.com';
const internalServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

let cachedToken = '';
let cachedTokenExpiresAt = 0;
let currentRefreshToken = initialRefreshToken;

type HookPayload = {
  user: {
    email: string;
    new_email?: string;
  };
  email_data: {
    token: string;
    token_new?: string;
    email_action_type: string;
  };
};

type MessageNotification = {
  type: 'message_notification';
  recipient: string;
  candidateName: string;
  companyName: string;
  roleName: string;
  messageBody: string;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  }[character] || character));
}

function sameSecret(left: string, right: string) {
  if (!left || left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

function clean(value: unknown, maxLength: number) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function emailCopy(action: string) {
  if (action === 'recovery') {
    return {
      subject: 'Reset your Hire From SA password',
      heading: 'Reset your password',
      instruction: 'Enter this code on the password reset screen.',
    };
  }
  if (action === 'email_change') {
    return {
      subject: 'Confirm your new Hire From SA email',
      heading: 'Confirm your email change',
      instruction: 'Enter this code to confirm your new email address.',
    };
  }
  if (action === 'reauthentication') {
    return {
      subject: 'Your Hire From SA security code',
      heading: 'Confirm it is you',
      instruction: 'Enter this code to continue.',
    };
  }
  return {
    subject: 'Your Hire From SA verification code',
    heading: 'Verify your email',
    instruction: 'Enter this six-digit code on the verification screen.',
  };
}

function renderEmail(code: string, heading: string, instruction: string) {
  const safeCode = escapeHtml(code);
  const safeHeading = escapeHtml(heading);
  const safeInstruction = escapeHtml(instruction);
  return `<!doctype html>
<html lang="en">
  <body style="margin:0;background:#f4f7fb;font-family:Arial,sans-serif;color:#12213a">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f7fb;padding:36px 16px">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #dbe4f0;border-radius:18px;overflow:hidden">
          <tr><td style="background:#246fe5;padding:24px 30px;color:#ffffff;font-size:15px;font-weight:700;letter-spacing:.08em">HIRE FROM SA</td></tr>
          <tr><td style="padding:34px 30px">
            <h1 style="margin:0 0 12px;font-size:28px;line-height:1.2">${safeHeading}</h1>
            <p style="margin:0 0 24px;color:#5c6b82;font-size:16px;line-height:1.6">${safeInstruction}</p>
            <div style="padding:18px 20px;border-radius:12px;background:#edf4ff;color:#12213a;font-size:34px;font-weight:800;letter-spacing:.22em;text-align:center">${safeCode}</div>
            <p style="margin:24px 0 0;color:#7b8799;font-size:13px;line-height:1.6">If you did not request this code, you can ignore this email.</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

function renderMessageNotification(candidateName: string, companyName: string, roleName: string, messageBody: string) {
  const firstName = escapeHtml(candidateName.split(/\s+/)[0] || 'there');
  const safeCompany = escapeHtml(companyName || 'A hirer');
  const safeRole = escapeHtml(roleName || 'your application');
  const safeMessage = escapeHtml(messageBody).replace(/\r?\n/g, '<br />');
  return `<!doctype html>
<html lang="en">
  <body style="margin:0;background:#f4f7fb;font-family:Arial,sans-serif;color:#12213a">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f7fb;padding:36px 16px">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:580px;background:#ffffff;border:1px solid #dbe4f0;border-radius:18px;overflow:hidden">
          <tr><td style="background:#246fe5;padding:24px 30px;color:#ffffff;font-size:15px;font-weight:700;letter-spacing:.08em">HIRE FROM SA</td></tr>
          <tr><td style="padding:34px 30px">
            <h1 style="margin:0 0 12px;font-size:28px;line-height:1.2">You have a new message</h1>
            <p style="margin:0 0 22px;color:#5c6b82;font-size:16px;line-height:1.6">Hi ${firstName}, ${safeCompany} sent you a message about the ${safeRole} role.</p>
            <div style="padding:18px 20px;border-left:4px solid #246fe5;border-radius:8px;background:#f5f8fd;color:#24344f;font-size:15px;line-height:1.65">${safeMessage}</div>
            <p style="margin:26px 0 0"><a href="https://www.hirefromsa.com/candidate-login.html?next=.%2Fcandidate-dashboard.html" style="display:inline-block;padding:14px 20px;border-radius:10px;background:#12213a;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none">Open messages</a></p>
            <p style="margin:24px 0 0;color:#7b8799;font-size:13px;line-height:1.6">Reply through Hire From SA so the conversation stays connected to your application.</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

async function getGraphToken() {
  if (cachedToken && Date.now() < cachedTokenExpiresAt) return cachedToken;
  const response = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: currentRefreshToken,
      scope: 'openid profile offline_access https://graph.microsoft.com/Mail.Send',
      grant_type: 'refresh_token',
    }),
  });
  const result = await response.json();
  if (!response.ok || !result.access_token) {
    throw new Error(`Microsoft token request failed (${response.status}).`);
  }
  cachedToken = result.access_token;
  currentRefreshToken = result.refresh_token || currentRefreshToken;
  cachedTokenExpiresAt = Date.now() + Math.max(60, Number(result.expires_in || 3600) - 120) * 1000;
  return cachedToken;
}

async function sendGraphEmail(recipient: string, subject: string, content: string) {
  const token = await getGraphToken();
  const response = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: {
        subject,
        body: {
          contentType: 'HTML',
          content,
        },
        toRecipients: [{ emailAddress: { address: recipient } }],
      },
      saveToSentItems: true,
    }),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`Microsoft sendMail failed (${response.status}): ${detail}`);
  }
}

async function sendEmail(recipient: string, code: string, action: string) {
  const copy = emailCopy(action);
  await sendGraphEmail(recipient, copy.subject, renderEmail(code, copy.heading, copy.instruction));
}

async function sendCandidateMessageEmail(notification: MessageNotification) {
  const recipient = clean(notification.recipient, 254).toLowerCase();
  const candidateName = clean(notification.candidateName, 120);
  const companyName = clean(notification.companyName, 120);
  const roleName = clean(notification.roleName, 180);
  const messageBody = clean(notification.messageBody, 2000);
  if (!recipient || !recipient.includes('@') || !messageBody) throw new Error('The message notification is missing required fields.');
  const subjectCompany = (companyName || 'A hirer').replace(/[\r\n]+/g, ' ');
  const subjectRole = (roleName || 'your application').replace(/[\r\n]+/g, ' ');
  await sendGraphEmail(
    recipient,
    `New message from ${subjectCompany} about ${subjectRole}`,
    renderMessageNotification(candidateName, companyName, roleName, messageBody),
  );
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('not allowed', { status: 400 });
  if (!tenantId || !clientId || !clientSecret || !initialRefreshToken || !senderAddress) {
    return Response.json({ error: { http_code: 500, message: 'Email service is not configured.' } }, { status: 500 });
  }

  try {
    const suppliedInternalKey = request.headers.get('x-internal-email-key') || '';
    if (suppliedInternalKey) {
      if (!sameSecret(suppliedInternalKey, internalServiceKey)) return Response.json({ error: 'Unauthorized.' }, { status: 401 });
      const notification = await request.json() as MessageNotification | { type: 'health_check' };
      if (notification.type === 'health_check') {
        await getGraphToken();
        return Response.json({ configured: true });
      }
      if (notification.type !== 'message_notification') return Response.json({ error: 'Unknown internal email type.' }, { status: 400 });
      await sendCandidateMessageEmail(notification);
      return Response.json({ sent: true });
    }
    if (!hookSecret) return Response.json({ error: { http_code: 500, message: 'Auth email hook is not configured.' } }, { status: 500 });
    const payload = await request.text();
    const webhook = new Webhook(hookSecret);
    const { user, email_data } = webhook.verify(payload, Object.fromEntries(request.headers)) as HookPayload;
    const recipient = email_data.email_action_type === 'email_change' && user.new_email ? user.new_email : user.email;
    const code = email_data.email_action_type === 'email_change' && email_data.token_new ? email_data.token_new : email_data.token;
    if (!recipient || !code) throw new Error('The Auth hook did not include a recipient and code.');
    await sendEmail(recipient, code, email_data.email_action_type);
    return Response.json({});
  } catch (error) {
    console.error('Auth email delivery failed:', error);
    return Response.json({
      error: {
        http_code: 500,
        message: error instanceof Error ? error.message : 'Email delivery failed.',
      },
    }, { status: 500 });
  }
});
