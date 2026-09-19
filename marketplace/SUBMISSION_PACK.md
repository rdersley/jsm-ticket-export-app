# Nuvriqo Excel Report Manager for Jira — Marketplace Submission Pack

**Marketplace Forge app ID:** `ari:cloud:ecosystem::app/77b1744e-faac-4db7-9b7d-d066f858fe7c`

**Release branch:** `marketplace-release`

**Version:** `1.0.0`

## Listing name
Nuvriqo Excel Report Manager for Jira

## Tagline
Create, schedule and email professional Excel reports from Jira — without Jira Automation rules or scripting.

## Short description
Build reusable Excel report templates from Jira data, export up to 10,000 work items, schedule delivery, and send polished XLSX reports by email using Microsoft 365 or SendGrid.

## Key highlights
1. **Professional Excel exports from Jira** — choose standard and custom fields, rename headings, reorder columns, set widths, and apply workbook formatting.
2. **Reusable report templates** — save JQL/filter-based report definitions and reuse the same template from Jira Search work items.
3. **Scheduled email delivery** — deliver XLSX reports daily, on weekdays, weekly, or monthly with configurable timezone, recipients, CC, subject, body, and attachment name.

## Long description
Nuvriqo Excel Report Manager for Jira helps teams turn Jira data into polished, reusable Excel reports without building Jira Automation rules or maintaining scripts.

Create report templates from JQL or saved Jira filters, choose exactly which Jira fields should appear, control column order and labels, and apply workbook styling such as header colours, font settings, alternating rows, native Excel dates, wrapping, filters, frozen headers, Jira links and print settings.

Saved reports can be run manually at any time or used as reusable export templates from Jira Search work items. Manual and navigator exports support up to 10,000 work items per workbook and use background processing for larger reports.

For recurring reporting, enable schedules and deliver the generated XLSX file by email. Delivery supports daily, weekday, weekly and monthly schedules with timezone awareness, multiple recipients, CC, editable subject/body text and filename variables.

### Core features
- Create reports from JQL or saved Jira filters
- Export up to 10,000 Jira work items per workbook
- Select standard and custom Jira fields
- Drag-and-drop column ordering with arrow controls as a fallback
- Rename Excel column headings and control column widths
- Professional workbook styling and print settings
- Native Excel date formatting
- Jira issue hyperlinks
- Clean Linked Issues export using Jira ticket keys
- Save reports as reusable Excel templates
- Export current Jira Search work items using a saved template
- Manual report generation and download
- Scheduled delivery: daily, weekdays, weekly or monthly
- Timezone-aware scheduling
- Multiple recipients and CC
- Editable email subject, body and attachment filename
- Run history showing successful and failed runs
- Duplicate and delete reports
- Microsoft 365 / Microsoft Graph delivery using customer-provided Entra application credentials
- SendGrid delivery using a customer-provided API key

## v1 supported email configuration
### Microsoft 365 / Microsoft Graph
The customer configures their own Microsoft Entra application and supplies Tenant ID, Application/Client ID, Client Secret, sender email and sender name. The app uses Microsoft Graph to send scheduled report emails from the configured mailbox.

### SendGrid
The customer supplies their own SendGrid API key and sender details. The app uses SendGrid only for delivery of report emails configured by the customer.

## Not included in v1
- JSM Portal Reports / customer portal publishing (kept in the separate consent-free companion architecture until Marketplace onboarding can install/configure both Forge apps automatically)
- Private Weekly SD → Hardware reporting
- Private Resolution Repair tooling
- Retail in Motion / airline / customer-specific mappings
- Microsoft 365 Easy Connect / shared Nuvriqo OAuth application
- Uploaded XLSX files as templates
- Excel charts or pivot tables
- Cloud file destinations such as OneDrive/SharePoint/S3
- Customer/organisation-specific workbook splitting

## Marketplace categories / keywords
Suggested categories: Reporting, Project management, ITSM / Service management.

Suggested keywords: Excel, XLSX, export, reporting, scheduled reports, email reports, Jira reports, JQL, saved filters, Jira Service Management, spreadsheet, automation alternative.

## Scope justifications
### `read:jira-work`
Required to read Jira work items and their fields when generating Excel reports, previews and exports.

### `read:field:jira`
Required to retrieve available Jira standard and custom field metadata so administrators can choose report columns and friendly field labels.

### `read:filter:jira`
Required to list and read saved Jira filters when a report uses a saved filter as its data source.

### `read:user:jira`
Required where Jira user metadata is needed to render user-related fields in report output.

### `storage:app`
Required to store report definitions, schedule configuration, run history, encrypted provider credentials and temporary/background export state in Forge storage.

## External egress / remote hosts
### `login.microsoftonline.com`
Used only when Microsoft 365 / Graph delivery is configured. The app sends the configured tenant/client credentials to Microsoft identity services to obtain an OAuth access token. Jira issue data is not sent to this host.

### `graph.microsoft.com`
Used only when Microsoft 365 / Graph delivery is configured. The generated report email, recipients, message content and XLSX attachment are sent to Microsoft Graph so Microsoft 365 can deliver the report from the customer's configured mailbox.

### `api.sendgrid.com`
Used only when SendGrid delivery is configured. The generated report email, recipients, message content and XLSX attachment are sent to SendGrid for delivery using the customer's own SendGrid account/API key.

## Data handling summary
- Jira data is read only when generating reports, previews or scheduled deliveries.
- Report definitions, schedules, run history and provider configuration are stored using Forge app storage.
- Email provider secrets are stored using Forge secret storage where supported by the implementation.
- Generated Excel files are created for the requested report/export and are not intended as a permanent external data store.
- Jira data is only sent outside Atlassian when the customer explicitly configures and uses Microsoft 365 / Graph or SendGrid for email delivery.
- The app does not sell customer data and does not use Jira data for advertising.

## Runs on Atlassian
Do **not** claim the Runs on Atlassian badge for v1. The app supports optional external email delivery through Microsoft Graph and SendGrid and therefore has declared external egress.

## Support details
Support email: support@nuvriqo.com

Recommended support wording:
"For installation, configuration, report design, scheduling or delivery issues, contact support@nuvriqo.com. Include your Jira Cloud site URL, the app screen involved, and the approximate time of the issue. Do not send passwords, API keys or client secrets by email."

## Documentation pages to publish
1. Overview / Getting started
2. Creating a report
3. Selecting Jira fields and formatting Excel output
4. Exporting from Jira Search work items
5. Scheduling reports
6. Microsoft 365 / Graph setup
7. SendGrid setup
8. Troubleshooting
9. Privacy and security
10. Support

## Screenshot set
Use screenshots containing generic/non-customer data only.
1. Main report dashboard
2. Report data source / JQL configuration
3. Excel column designer
4. Workbook styling page
5. Schedule page
6. Email delivery page
7. Example generated XLSX workbook
8. Run history
9. Jira Search work items export action
10. Email provider settings

Do not use Retail inMotion, Ryanair, SkyChefs, real email addresses, real ticket content or customer identifiers in Marketplace images.

## Reviewer notes
The app is a Forge app for Jira Cloud. It reads Jira work-item data and generates XLSX files. External egress is limited to optional customer-configured email delivery through Microsoft Graph or SendGrid. The app can be used for manual report generation without configuring an email provider.

For Marketplace review, use a test report with generic data and keep scheduled delivery disabled unless reviewer email-provider credentials are available.

## Release gate
Before submission confirm:
- Marketplace build uses Forge app ID `ari:cloud:ecosystem::app/77b1744e-faac-4db7-9b7d-d066f858fe7c`, not the private worksite app ID.
- Marketplace manifest contains no private Hardware, Resolution Repair, Retail in Motion or Portal Reports companion modules.
- Marketplace package exclusions are active through `.forgeignore`.
- Main dashboard loads without timeout.
- Create/edit/duplicate/delete report works.
- Preview/download works.
- Large/background manual export works.
- 10,000 item safety limit is enforced.
- Linked Issues export shows Jira keys only.
- Jira Search work items export works using a saved template.
- Run history records manual/scheduled outcomes.
- Scheduler timezone logic passes regression tests.
- Microsoft Advanced and/or SendGrid delivery is tested with customer-owned credentials where available.
- No test/customer secrets are committed to GitHub.
- Privacy policy, terms/EULA, support page and security contact URLs are live.
- Partner verification and Privacy & Security tab are complete before review.

## Future v1.1
Microsoft 365 Easy Connect is preserved separately for further validation. Do not advertise it in the v1 Marketplace listing until tenant-admin consent, refresh-token scheduling and publisher-verification behaviour have been fully tested.
