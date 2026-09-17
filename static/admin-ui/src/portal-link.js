import { router } from '@forge/bridge';

const MODULE_KEY = 'nuvriqo-excel-portal-reports-admin';

function addPortalReportsButton() {
  if (document.querySelector('[data-nuvriqo-portal-reports]')) return true;

  const buttons = [...document.querySelectorAll('button')];
  const emailButton = buttons.find(button => button.textContent?.trim() === 'Email settings');
  if (!emailButton?.parentElement) return false;

  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Portal reports';
  button.dataset.nuvriqoPortalReports = 'true';
  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      await router.navigate({ target: 'module', moduleKey: MODULE_KEY });
    } catch (error) {
      console.error('Could not open Portal Reports', error);
      button.disabled = false;
    }
  });

  emailButton.parentElement.insertBefore(button, emailButton);
  return true;
}

if (!addPortalReportsButton()) {
  const observer = new MutationObserver(() => {
    if (addPortalReportsButton()) observer.disconnect();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}
