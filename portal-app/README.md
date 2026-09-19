# Nuvriqo Portal Reports Companion

This free Forge companion renders Excel Report Manager reports in the Jira Service Management customer portal without requesting Jira product access from portal customers.

## Marketplace role

The companion is installed on the same Jira Cloud site as Nuvriqo Excel Report Manager for Jira.

Setup:
1. Install both Marketplace apps.
2. In Excel Report Manager, open **Portal Reports** and copy the Companion setup code.
3. In **Portal Reports Companion** configuration, paste the code and connect.
4. Configure which saved reports are visible to all portal customers, selected users, or selected JSM organisations.

The setup code contains an installation-specific Forge web-trigger URL and a generated shared secret. The companion stores the URL in Forge storage and the secret in Forge secret storage.

The companion has no Jira product scopes. It uses only Forge storage and outbound calls to the paired Excel Report Manager installation's Atlassian web-trigger endpoint.
