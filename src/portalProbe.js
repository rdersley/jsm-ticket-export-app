import Resolver from '@forge/resolver';

const resolver = new Resolver();

resolver.define('probe', async () => ({
  ok: true,
  message: 'Backend resolver connected without customer authorization.'
}));

export const handler = resolver.getDefinitions();
