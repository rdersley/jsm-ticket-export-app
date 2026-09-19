# Nuvriqo Excel Report Manager for Jira

Create, style, schedule and email professional Excel reports from Jira without Jira Automation rules or custom scripts.

## Marketplace v1 features

- Build reports from JQL or saved Jira filters
- Discover standard and custom Jira fields
- Add, rename, resize and reorder Excel columns
- Style workbook headings, fonts, dates, alternating rows and print settings
- Generate XLSX files with native Excel dates and Jira hyperlinks
- Export up to 10,000 work items per workbook
- Save reusable report templates
- Export the current Jira Search result using a saved template
- Run larger exports asynchronously
- Schedule reports daily, on weekdays, weekly or monthly
- Timezone-aware scheduling
- Send scheduled XLSX reports through customer-configured Microsoft 365 / Graph or SendGrid
- View report run history

## Marketplace / private build separation

This branch is the public Marketplace release line.

It intentionally excludes Nuvriqo's private worksite tooling, including Weekly SD → Hardware reporting, Resolution Repair and customer-specific mappings or deployment configuration.

Portal Reports for JSM customers uses a separate consent-free Forge companion architecture. It is not advertised or shipped in Marketplace v1 until the two-app onboarding/install handshake is automated for Marketplace customers.

## Development

```bash
npm install
npm test
npm run build
forge lint
```

Vendor: Nuvriqo  
Support: support@nuvriqo.com
