export const DEFAULT_COLUMNS = [
  { fieldId: 'key', label: 'Key', width: 14 },
  { fieldId: 'summary', label: 'Summary', width: 48 },
  { fieldId: 'status', label: 'Status', width: 20 },
  { fieldId: 'assignee', label: 'Assignee', width: 24 },
  { fieldId: 'created', label: 'Created', width: 20 }
];

export const DEFAULT_REPORT = {
  id: null,
  name: 'New Jira report',
  description: '',
  enabled: false,
  source: { type: 'jql', jql: 'ORDER BY created DESC', filterId: null, maxIssues: 500 },
  template: {
    columns: DEFAULT_COLUMNS,
    workbook: {
      sheetName: 'Issues',
      title: '',
      subtitle: '',
      freezeHeader: true,
      autoFilter: true,
      alternateRows: true,
      jiraLinks: true,
      generatedAt: true,
      footerInfo: true,
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
    recipients: [], cc: [],
    subject: '{{reportName}} – {{date}}',
    body: 'Please find the attached Jira report.\n\nIssues included: {{issueCount}}\nGenerated: {{generatedAt}}',
    attachmentName: '{{reportName}} - {{date}}.xlsx'
  },
  createdAt: null,
  updatedAt: null
};
