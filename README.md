# Nuvriqo Excel Report Manager

Create, style, schedule and email professional Jira Excel reports without Jira Automation rules.

## Core features

- Standard and custom Jira field discovery
- Add, rename, resize and reorder Excel columns
- Visual workbook options and mini-preview
- XLSX generation with ExcelJS
- Pagination up to a configurable issue limit
- Jira hyperlinks, filters, frozen headers, titles and alternating rows
- Downloadable live preview
- Scheduled report delivery
- Microsoft 365 / Graph and SendGrid email delivery
- Reusable templates from Jira search / issue navigator
- Portal report publishing for JSM customers

## Weekly SD → Hardware Management Report

The app also includes a dedicated management export for support flows where crew/customer demand starts in one Jira project and agents create a separate Hardware issue when physical intervention is required.

The report runs two independent base JQL queries:

- **SD JQL** for Service Desk demand, for example `project = SD AND "SD Client" = RYR`
- **HW JQL** for Hardware workload, for example `project = HW AND "SD Client" = RYR`

The app adds the selected report period to both queries automatically and generates one workbook containing:

- SD tickets raised
- SD tickets escalated to linked HW issues
- escalation rate
- HW tickets created
- devices sent using the configured Date Sent field
- devices received back using Jira status-transition history
- current open HW tickets
- open HW tickets older than two weeks
- HW tickets closed during the period
- awaiting-dispatch and awaiting-return counts
- separate SD and HW detail sheets
- a configuration sheet showing the actual JQL and mappings used

The Jira global navigation entry is **Weekly SD → Hardware Report**.

## Development

```bash
npm install
npm test
npm run build
forge lint
```
