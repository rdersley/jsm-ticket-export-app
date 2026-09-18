import Resolver from '@forge/resolver';

const resolver = new Resolver();

resolver.define('portal:list', ({ context }) => ({
  ok: true,
  accountType: context?.accountType || '',
  signedIn: Boolean(context?.accountId),
  reports: []
}));

export const handler = resolver.getDefinitions();
