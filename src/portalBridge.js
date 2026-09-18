import { handlePortalAction } from './portalCustomer.js';
import { saveReport } from './services/reportStore.js';
import { kvs } from '@forge/kvs';

function headerValue(headers, name) {
  const entry = Object.entries(headers || {}).find(([key]) => key.toLowerCase() === name.toLowerCase());
  const value = entry?.[1];
  return Array.isArray(value) ? String(value[0] || '') : String(value || '');
}

async function seedDevelopmentReport() {
  if (String(process.env.PORTAL_DEV_SEED_ENABLED || '').toLowerCase() !== 'true') {
    throw new Error('Development seeding is disabled.');
  }

  const reportId = 'dev-portal-smoke-report';
  await saveReport({
    id: reportId,
    name: 'Portal Reports Smoke Test',
    description: 'Development-only report used to verify portal listing, generation and download.',
    enabled: false,
    source: { type: 'jql', jql: 'created >= -30d ORDER BY created DESC', filterId: null, maxIssues: 10 },
    template: {
      columns: [
        { fieldId: 'key', label: 'Key', width: 14 },
        { fieldId: 'summary', label: 'Summary', width: 48 },
        { fieldId: 'status', label: 'Status', width: 20 },
        { fieldId: 'created', label: 'Created', width: 20 }
      ],
      workbook: {
        sheetName: 'Issues',
        title: 'Portal Reports Smoke Test',
        subtitle: '',
        freezeHeader: true,
        autoFilter: true,
        alternateRows: true,
        jiraLinks: true,
        generatedAt: true,
        footerInfo: true,
        wrapText: true,
        showGridLines: false,
        autoDateFormat: true,
        dateFormat: 'dd/mm/yyyy hh:mm',
        orientation: 'landscape',
        fitToPage: true,
        fontName: 'Aptos',
        bodyFontSize: 11,
        headerFontSize: 11,
        headerBold: true,
        headerBackground: '#0C66E4',
        headerTextColor: '#FFFFFF',
        headerAlignment: 'left',
        alternateRowBackground: '#F7F8F9',
        bodyTextColor: '#172B4D',
        rowHeight: 20
      }
    },
    schedule: {
      frequency: 'weekly',
      time: '08:00',
      timezone: 'Europe/Dublin',
      weekday: 1,
      monthDay: 1
    },
    delivery: {
      recipients: [],
      cc: [],
      subject: '{{reportName}} – {{date}}',
      body: 'Development-only portal report.',
      attachmentName: '{{reportName}} - {{date}}.xlsx'
    }
  });

  await kvs.set(`portal:config:${reportId}`, {
    reportId,
    enabled: true,
    serviceDeskIds: [],
    accessMode: 'all',
    userAccountIds: [],
    organizationIds: [],
    organizationAccountIds: [],
    allowRun: true,
    allowDownload: true,
    updatedAt: new Date().toISOString()
  });

  return { reportId };
}

function response(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': ['application/json'], 'Cache-Control': ['no-store'] },
    body: JSON.stringify(body)
  };
}

export async function trigger(request) {
  const expected = String(process.env.PORTAL_BRIDGE_TOKEN || '');
  const auth = headerValue(request?.headers, 'authorization');
  if (!expected || auth !== `Bearer ${expected}`) {
    return response(401, { ok: false, error: 'Unauthorized' });
  }

  try {
    const input = request?.body ? JSON.parse(request.body) : {};
    if (input.action === 'ping') return response(200, { ok: true });
    if (input.action === 'seed-dev-report') {
      const data = await seedDevelopmentReport();
      return response(200, { ok: true, data });
    }

    const accountId = String(input.accountId || '').trim();
    if (!accountId) return response(400, { ok: false, error: 'Missing accountId' });

    const portalId = String(input.portalId || '').trim();
    const context = {
      accountId,
      accountType: 'customer',
      extension: { portal: { id: portalId } }
    };
    const data = await handlePortalAction(input.action, input.payload || {}, context);
    return response(200, { ok: true, data });
  } catch (error) {
    return response(400, { ok: false, error: error?.message || 'Portal bridge request failed.' });
  }
}
