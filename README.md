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
- Publish backend-generated Excel reports to selected JSM portal customers through customer-visible JSM requests and attachments

## Portal Reports

Portal Reports remains inside the single Marketplace app.

Admins choose a saved report, a JSM service project and selected portal customers. Forge generates the workbook using the app's Jira permissions and publishes the finished XLSX as a public attachment on a customer-visible JSM request.

The customer-facing portal module is intentionally static and makes no Jira API or Forge resolver calls. This avoids the customer-facing "Allow access" consent prompt while keeping report generation and delivery inside Atlassian.

## Marketplace / private build separation

This branch is the public Marketplace release line.

It intentionally excludes Nuvriqo's private worksite tooling, including Weekly SD → Hardware reporting, Resolution Repair and customer-specific mappings or deployment configuration.

## Development

```bash
npm install
npm test
npm run build
forge lint
```

Vendor: Nuvriqo  
Support: support@nuvriqo.com
