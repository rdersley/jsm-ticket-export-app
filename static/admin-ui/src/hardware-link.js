import { router } from '@forge/bridge';

const MODULE_KEY = 'nuvriqo-weekly-hardware-report-admin';

function addHardwareReportButton() {
  if (document.querySelector('[data-nuvriqo-hardware-report]')) return true;

  const buttons = [...document.querySelectorAll('button')];
  const emailButton = buttons.find(button => button.textContent?.trim() === 'Email settings');
  if (!emailButton?.parentElement) return false;

  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Weekly SD → HW report';
  button.dataset.nuvriqoHardwareReport = 'true';
  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      await router.navigate({ target: 'module', moduleKey: MODULE_KEY });
    } catch (error) {
      console.error('Could not open Weekly SD → Hardware Report', error);
      button.disabled = false;
    }
  });

  emailButton.parentElement.insertBefore(button, emailButton);
  return true;
}

if (!addHardwareReportButton()) {
  const observer = new MutationObserver(() => {
    if (addHardwareReportButton()) observer.disconnect();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}
