import { kvs } from '@forge/kvs';

const KEY = 'hardware-weekly:settings:v1';

export async function getHardwareWeeklySettings() {
  return (await kvs.get(KEY)) || null;
}

export async function saveHardwareWeeklySettings(settings = {}) {
  const safe = {
    form: settings.form || {},
    repair: settings.repair || {},
    updatedAt: new Date().toISOString()
  };
  await kvs.set(KEY, safe);
  return safe;
}
