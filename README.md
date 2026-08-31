# Nuvriqo Excel Report Manager for Jira

A Forge app for creating, previewing, scheduling and delivering professional Excel reports from Jira without Jira Automation rules.

## Current V1 build

- Dedicated global Jira admin page
- Report dashboard with active/draft state
- Five-step report wizard
- Saved Jira filter picker plus direct JQL
- Standard and custom Jira field discovery
- Add, rename, resize and reorder Excel columns
- Visual workbook options and mini-preview
- XLSX generation with ExcelJS
- Pagination up to a configurable issue limit
- Jira hyperlinks, filters, frozen headers, titles and alternating rows
- Downloadable live preview
- Manual Run now and download
- Friendly daily / weekdays / weekly / monthly schedules
- App-owned scheduler and duplicate-run protection
- Email recipients, CC, subject/body and attachment template configuration
- Run history
- Duplicate and delete report actions

## Remaining deployment work

1. Create/register the dedicated Forge app and replace `REPLACE_WITH_FORGE_APP_ID` in the manifest.
2. Choose and configure the Marketplace-safe email transport adapter.
3. Run Forge lint/build/deploy and install into the test Jira site.
4. Add automated unit/integration tests before release candidate.

The app is intentionally separate from the existing Nuvriqo JSM portal CSV exporter.
