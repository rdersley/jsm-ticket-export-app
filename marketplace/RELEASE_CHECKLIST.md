# Marketplace Release Checklist — Nuvriqo Excel Report Manager for Jira

## Code / QA
- [ ] Latest main CI is green
- [ ] Forge lint passes
- [ ] `npm audit --audit-level=high` passes
- [ ] Regression tests pass
- [ ] Main dashboard loads without timeout
- [ ] Create / edit / duplicate / delete report tested
- [ ] Preview and manual download tested
- [ ] Background export tested on a large report
- [ ] 10,000 work-item cap confirmed
- [ ] Linked Issues export shows ticket keys only
- [ ] Jira Search work-items export tested with saved template
- [ ] Run history records successful and failed runs
- [ ] Schedule timezone behaviour confirmed
- [ ] Microsoft Graph Advanced delivery tested if credentials are available
- [ ] SendGrid delivery tested if credentials are available

## Marketplace v1 scope
- [x] Microsoft Easy Connect removed from v1 release path
- [x] Easy Connect work preserved on `feature/microsoft-easy-connect-v1-1`
- [x] No Forge OAuth web trigger in v1 manifest
- [x] Only declared external email egress remains: Microsoft identity/Graph and SendGrid

## Repository / release hygiene
- [x] Obsolete one-time workflows removed
- [x] Normal CI retained
- [x] Clean manual production release workflow added
- [ ] Confirm no secrets committed to repository
- [ ] Create/tag final release after last QA pass

## Marketplace listing
- [ ] Listing name: Nuvriqo Excel Report Manager for Jira
- [ ] Tagline and short description entered
- [ ] Long description entered
- [ ] Three highlights entered
- [ ] Categories / keywords entered
- [ ] App logo uploaded
- [ ] Banner / hero artwork uploaded if requested
- [ ] Generic screenshots uploaded with no customer data
- [ ] Support email set to support@nuvriqo.com
- [ ] Documentation URL live
- [ ] Privacy policy URL live
- [ ] Terms / EULA URL live
- [ ] Security contact URL/email live

## Privacy & Security tab
- [ ] Scope `read:jira-work` justified
- [ ] Scope `read:field:jira` justified
- [ ] Scope `read:filter:jira` justified
- [ ] Scope `storage:app` justified
- [ ] `login.microsoftonline.com` declared and explained
- [ ] `graph.microsoft.com` declared and explained
- [ ] `api.sendgrid.com` declared and explained
- [ ] External email delivery described as optional/customer-configured
- [ ] Runs on Atlassian **not** claimed
- [ ] Data handling statements checked against implementation

## Partner / submission prerequisites
- [ ] Atlassian Marketplace Partner profile complete
- [ ] Partner due-diligence / identity verification complete or in progress
- [ ] Developer-space ownership is the intended Nuvriqo account
- [ ] Forge app sharing/distribution enabled when ready to link listing
- [ ] Privacy & Security ticket/check completed as required by Atlassian
- [ ] Any vulnerability ticket resolved before review

## Reviewer test notes
- Manual report generation does not require email configuration.
- For review, use a generic Jira project and generic JQL/filter.
- Email delivery can be tested with reviewer/customer-provided Microsoft Entra or SendGrid credentials.
- Microsoft Easy Connect is not part of the v1 listing and must not appear in v1 screenshots or claims.
