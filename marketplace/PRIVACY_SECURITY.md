# Nuvriqo Excel Report Manager for Jira — Privacy & Security Draft

This document is a working draft for the Marketplace Privacy & Security tab and Nuvriqo website. It should be reviewed before publication and is not legal advice.

## Product
Nuvriqo Excel Report Manager for Jira

## Provider
Nuvriqo

## Support / security contact
support@nuvriqo.com

## What the app does
The app reads Jira work-item data selected by an administrator/user in order to generate Excel workbooks, previews, manual downloads and scheduled report emails.

## Data accessed from Jira
Depending on the report configuration, the app may access:
- Jira issue/work-item keys and IDs
- Summary, description and status
- Standard and custom field values
- Assignee/reporter/user display information present in selected Jira fields
- Dates and workflow fields
- Linked issue references
- Data returned by the customer's JQL or saved Jira filter

The app only accesses data within the scopes granted to the Forge app and used by the configured report.

## Data stored in Forge
The app uses Atlassian Forge app storage for operational configuration, including:
- Saved report definitions
- JQL/filter references
- Selected columns and workbook formatting options
- Schedule configuration
- Email delivery configuration
- Run history / status information
- Temporary state required for background exports

Provider credentials that are treated as secrets by the implementation are stored using Forge secret storage.

## Generated workbook data
Excel workbooks are generated for manual download or scheduled email delivery. The app is not designed to use generated workbooks as a permanent external file repository.

## External data transfers
External transfers only occur when the customer configures an external email provider.

### Microsoft 365 / Microsoft Graph
Hosts:
- login.microsoftonline.com
- graph.microsoft.com

Purpose:
- Microsoft identity endpoints are used to obtain an access token from customer-provided Entra application credentials.
- Microsoft Graph receives the configured recipients, email subject/body and generated XLSX attachment so Microsoft 365 can deliver the report from the customer's configured mailbox.

### SendGrid
Host:
- api.sendgrid.com

Purpose:
- SendGrid receives the configured recipients, email subject/body and generated XLSX attachment so the report can be delivered using the customer's own SendGrid account/API key.

## Customer control
- Email delivery is optional.
- Manual Excel exports do not require an external email provider.
- Schedules are explicitly enabled per report.
- Customers choose the JQL/filter, fields, recipients and message content used by each report.
- Customers can disable schedules or remove reports.

## Data sale / advertising
The app does not sell Jira customer data and does not use Jira data for advertising.

## Authentication secrets
Customers should never send passwords, API keys, tenant secrets or client secrets to Nuvriqo support by email.

## Data residency / Runs on Atlassian
Do not claim the Runs on Atlassian badge for the v1 release because optional report-email delivery uses declared external egress to Microsoft Graph and/or SendGrid.

## Security practices for listing answers
Use the following accurate statements where applicable:
- The application is built on Atlassian Forge.
- Jira access is limited by declared Forge scopes.
- External hosts are explicitly declared in the Forge manifest.
- The app does not access Atlassian user passwords or Atlassian login sessions.
- Secrets are not displayed back to users after storage.
- CI runs dependency audit, automated regression tests, Custom UI build and Forge lint.
- High-severity dependency audit findings block CI.

## Suggested privacy-policy wording
Nuvriqo Excel Report Manager processes Jira data only to provide report generation, export and delivery functionality requested by the customer. Report configuration and operational state are stored using Atlassian Forge storage. When a customer enables Microsoft 365 or SendGrid delivery, the report email and generated attachment are transmitted to the selected provider for delivery. Nuvriqo does not sell customer data or use Jira data for advertising.

## Data retention wording
Saved configuration remains until the customer edits/deletes it or the app's stored data is removed in accordance with Forge/application lifecycle behaviour. Temporary background-export state is operational data rather than a permanent document archive. Do not state a specific deletion timeframe unless it has been implemented and verified.

## Incident / vulnerability contact wording
Security concerns or suspected vulnerabilities can be reported to support@nuvriqo.com with the subject "Security — Excel Report Manager". Do not include live credentials or sensitive secrets in the initial report.

## Marketplace disclosure checklist
- Declare all Forge scopes exactly as in manifest.yml.
- Declare login.microsoftonline.com, graph.microsoft.com and api.sendgrid.com as external domains.
- Explain the data and purpose for each host.
- State that external email delivery is optional and customer-configured.
- Do not claim Runs on Atlassian.
- Do not claim Microsoft publisher verification for v1.
- Do not advertise Microsoft Easy Connect in v1.
