import { fetch } from '@forge/api';
import { kvs } from '@forge/kvs';

const SETTINGS_KEY = 'email:settings';
const SECRET_KEY = 'email:secret';

const defaults = {
  provider: 'none',
  senderEmail: '',
  senderName: 'Nuvriqo Excel Report Manager',
  tenantId: '',
  clientId: '',
  scheduledDeliveryEnabled: false
};

export async function getEmailSettings() {
  const settings = { ...defaults, ...((await kvs.get(SETTINGS_KEY)) || {}) };
  const secret = await kvs.getSecret(SECRET_KEY);
  return { ...settings, hasSecret: Boolean(secret), secret: undefined };
}

export async function saveEmailSettings(input = {}) {
  const provider = input.provider || 'none';
  const settings = {
    provider,
    senderEmail: String(input.senderEmail || '').trim(),
    senderName: String(input.senderName || 'Nuvriqo Excel Report Manager').trim(),
    tenantId: String(input.tenantId || '').trim(),
    clientId: String(input.clientId || '').trim(),
    scheduledDeliveryEnabled: Boolean(input.scheduledDeliveryEnabled)
  };

  if (provider === 'none') settings.scheduledDeliveryEnabled = false;

  await kvs.set(SETTINGS_KEY, settings);
  if (input.secret?.trim()) await kvs.setSecret(SECRET_KEY, input.secret.trim());
  if (provider === 'none') await kvs.deleteSecret(SECRET_KEY);
  return getEmailSettings();
}

function render(template = '', vars = {}) {
  return String(template).replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key) => vars[key] ?? '');
}

async function getConfig({ scheduled = false } = {}) {
  const settings = { ...defaults, ...((await kvs.get(SETTINGS_KEY)) || {}) };
  const secret = await kvs.getSecret(SECRET_KEY);
  if (!settings.provider || settings.provider === 'none') throw new Error('Email delivery is not configured. Open Email settings first.');
  if (!secret) throw new Error('Email provider secret is missing.');
  if (!settings.senderEmail) throw new Error('Sender email address is missing.');
  if (scheduled && !settings.scheduledDeliveryEnabled) throw new Error('Scheduled email delivery is disabled in Email settings.');
  return { ...settings, secret };
}

async function sendWithGraph(config, message) {
  if (!config.tenantId || !config.clientId) throw new Error('Microsoft 365 tenant ID and client ID are required.');
  const tokenResponse = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(config.tenantId)}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: config.clientId, client_secret: config.secret, scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials' }).toString()
  });
  if (!tokenResponse.ok) throw new Error(`Microsoft 365 authentication failed (${tokenResponse.status}).`);
  const { access_token: accessToken } = await tokenResponse.json();
  const recipients = emails => emails.map(address => ({ emailAddress: { address } }));
  const response = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(config.senderEmail)}/sendMail`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: {
      subject: message.subject,
      body: { contentType: 'Text', content: message.body },
      toRecipients: recipients(message.to),
      ccRecipients: recipients(message.cc || []),
      attachments: [{ '@odata.type': '#microsoft.graph.fileAttachment', name: message.attachmentName, contentType: message.contentType || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', contentBytes: message.workbookBase64 }]
    }, saveToSentItems: true })
  });
  if (!response.ok) throw new Error(`Microsoft 365 send failed (${response.status}).`);
}

async function sendWithSendGrid(config, message) {
  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.secret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      personalizations: [{ to: message.to.map(email => ({ email })), cc: (message.cc || []).map(email => ({ email })) }],
      from: { email: config.senderEmail, name: config.senderName || undefined },
      subject: message.subject,
      content: [{ type: 'text/plain', value: message.body }],
      attachments: [{ content: message.workbookBase64, filename: message.attachmentName, type: message.contentType || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', disposition: 'attachment' }]
    })
  });
  if (!response.ok) throw new Error(`SendGrid send failed (${response.status}).`);
}

export async function sendReportEmail(report, workbookBase64, issueCount) {
  const config = await getConfig({ scheduled: true });
  const to = report.delivery?.recipients || [];
  if (!to.length) throw new Error('Add at least one email recipient.');
  const now = new Date();
  const vars = { reportName: report.name, issueCount, generatedAt: now.toISOString(), date: now.toISOString().slice(0, 10) };
  const message = {
    to,
    cc: report.delivery?.cc || [],
    subject: render(report.delivery?.subject || report.name, vars),
    body: render(report.delivery?.body || '', vars),
    attachmentName: render(report.delivery?.attachmentName || `${report.name}.xlsx`, vars),
    workbookBase64,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  };
  if (config.provider === 'microsoft-graph') return sendWithGraph(config, message);
  if (config.provider === 'sendgrid') return sendWithSendGrid(config, message);
  throw new Error(`Unsupported email provider: ${config.provider}`);
}

export async function sendTestEmail(address) {
  const config = await getConfig();
  const message = {
    to: [String(address || '').trim()],
    cc: [],
    subject: 'Nuvriqo Excel Report Manager – test email',
    body: 'Your email delivery settings are working.',
    attachmentName: 'email-test.txt',
    workbookBase64: Buffer.from('Email delivery test').toString('base64'),
    contentType: 'text/plain'
  };
  if (!message.to[0]) throw new Error('Enter a test email address.');
  if (config.provider === 'microsoft-graph') return sendWithGraph(config, message);
  if (config.provider === 'sendgrid') return sendWithSendGrid(config, message);
  throw new Error(`Unsupported email provider: ${config.provider}`);
}
