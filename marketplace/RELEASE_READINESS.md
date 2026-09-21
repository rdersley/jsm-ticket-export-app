# Marketplace Release Readiness — Excel Report Manager v1.0.0

## Public Forge app
- **App:** Nuvriqo Excel Report Manager for Jira
- **Forge app ID:** `ari:cloud:ecosystem::app/77b1744e-faac-4db7-9b7d-d066f858fe7c`
- **Branch:** `marketplace-release`
- **Vendor:** Nuvriqo
- **Support:** support@nuvriqo.com

## What ships in Marketplace v1
- Generic report builder from JQL or saved Jira filters
- Standard/custom field selection
- Excel column design and workbook styling
- Manual XLSX generation and download
- Background exports up to 10,000 work items
- Reusable saved templates
- Jira Search / issue navigator export action
- Daily / weekday / weekly / monthly schedules
- Timezone-aware scheduling
- Microsoft 365 / Microsoft Graph email delivery with customer-owned credentials
- SendGrid email delivery with customer-owned credentials
- Run history
- JSM Portal Reports publishing and access control
- Publish generated XLSX reports to selected JSM portal customers
- Customer delivery through normal JSM requests and public attachments
- Static consent-free portal guidance panel

## Portal Reports architecture
- Portal Reports is part of the same Forge app and Marketplace listing.
- Admins configure a target JSM service project and selected portal customers.
- Forge generates the workbook using app permissions, so the finished file may contain deliberately published data the customer cannot browse directly.
- The app creates a customer-visible JSM request and attaches the generated XLSX as a public attachment.
- The customer-facing portal module is static and performs no Jira API or Forge resolver calls, avoiding the customer-facing consent prompt.
- No companion app or external remote backend is required.

## Explicitly excluded from the public build
- Weekly SD → Hardware tooling
- Resolution Repair
- Retail in Motion / airline / client-specific mappings
- Private worksite deployment automation


The public manifest, resolver and async worker do not expose the private modules. `.forgeignore` also excludes private source/UI files from the Forge Marketplace package.

## Marketplace permissions
- `read:jira-work` — read Jira work items for report generation.
- `read:field:jira` — retrieve field metadata for report column selection.
- `read:filter:jira` — read saved Jira filters used as report sources.
- `read:user:jira` — read user metadata when required by user-related report fields.
- `read:servicedesk-request` — read JSM request metadata used for portal delivery administration.
- `write:servicedesk-request` — create customer-visible report requests and publish XLSX attachments.
- `read:servicedesk.customer:jira-service-management` — search selected portal customers for report delivery.
- `storage:app` — store report definitions, schedules, history, delivery settings and async export state.

## External egress
- `login.microsoftonline.com` — obtain Microsoft Graph access tokens when the customer configures Microsoft 365 delivery.
- `graph.microsoft.com` — send the configured report email and XLSX attachment through the customer's Microsoft 365 tenant.
- `api.sendgrid.com` — send configured report emails through the customer's SendGrid account.

Manual report generation does not require external email-provider configuration.

## Branding / listing
Current Atlassian naming rules permit **Nuvriqo Excel Report Manager for Jira** because the Atlassian product name follows the app name and the preposition "for". Do not put Jira/Atlassian branding in the app logo.

Suggested listing:
- **Name:** Nuvriqo Excel Report Manager for Jira
- **Tagline:** Create, schedule and email professional Excel reports from Jira — without Automation rules or scripting.
- **Category:** Reporting
- **Keywords:** Excel, XLSX, export, reporting, scheduled reports, email reports, JQL, saved filters, spreadsheet

## Submission blockers outside code
These require Marketplace / Partner Portal account actions rather than repository changes:
1. Enable sharing/distribution for Forge app `77b1744e-faac-4db7-9b7d-d066f858fe7c`.
2. Create/link the Marketplace listing to this Forge app.
3. Complete the Privacy & Security tab and any required ticket approval.
4. Ensure Partner verification is complete.
5. Add live Privacy Policy, Terms/EULA, Support and Security contact URLs.
6. Upload generic Marketplace logo/banner/screenshots with no customer data.
7. Choose pricing/payment model.
8. Validate installation on a clean Jira Cloud test site before submission.

## Final technical release sequence
1. Marketplace branch CI passes tests, build, audit and `forge lint`.
2. Deploy this app ID to Forge production from `marketplace-release`.
3. Enable app sharing in the Developer Console.
4. Install the production build on a clean test site from the distribution link.
5. Run the release-gate scenarios in `marketplace/SUBMISSION_PACK.md`.
6. Link the Forge app to the Marketplace listing and submit for review.

## Do not merge
Do not merge `marketplace-release` back into the private worksite release line. Keep both release lines independent so public Marketplace deployments can never remove or alter private worksite modules.

## Validation status
Development validation status: tests, dependency audit, UI build, Forge lint and Forge development deployment must all be green on the current branch head before production promotion.
