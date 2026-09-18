import Resolver from '@forge/resolver';

const resolver = new Resolver();

resolver.define('portal:probe', ({ context }) => ({
  ok: true,
  accountType: context?.accountType || '',
  hasAccountId: Boolean(context?.accountId),
  portalId: String(context?.extension?.portal?.id || context?.portal?.id || '')
}));

export const handler = resolver.getDefinitions();
