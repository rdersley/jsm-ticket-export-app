import React, { useEffect, useState } from 'react';
import ForgeReconciler, { Button, Heading, Inline, Lozenge, Spinner, Stack, Text } from '@forge/react';
import { invoke } from '@forge/bridge';

const PortalProbe = () => {
  const [context, setContext] = useState(null);
  const [apiResult, setApiResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const loadContext = async () => {
    try {
      setContext(await invoke('probe:context', {}));
    } catch (e) {
      setContext({ ok: false, error: e?.message || String(e) });
    }
  };

  useEffect(() => { loadContext(); }, []);

  const runApiProbe = async () => {
    setBusy(true);
    try {
      setApiResult(await invoke('probe:customer-api', {}));
    } catch (e) {
      setApiResult({ ok: false, error: e?.message || String(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack space="space.200">
      <Inline space="space.100" alignBlock="center">
        <Heading size="small">Forge-only Portal Test</Heading>
        <Lozenge appearance="inprogress">POC</Lozenge>
      </Inline>
      <Text>This panel has a real Forge resolver and the same Jira/JSM scopes planned for Excel Report Manager.</Text>

      {context === null ? <Spinner /> : (
        <Stack space="space.050">
          <Text>Resolver loaded: {context?.ok ? 'yes' : 'no'}</Text>
          <Text>Account type: {context?.accountType || 'not supplied'}</Text>
          <Text>Portal ID: {context?.portalId || 'not supplied'}</Text>
          {context?.error ? <Text>{context.error}</Text> : null}
        </Stack>
      )}

      <Button appearance="primary" isDisabled={busy} onClick={runApiProbe}>
        {busy ? 'Checking…' : 'Test customer Jira API'}
      </Button>

      {apiResult ? (
        <Stack space="space.050">
          <Text>API call: {apiResult.ok ? 'success' : 'failed'}</Text>
          <Text>HTTP status: {apiResult.status ?? 'none'}</Text>
          <Text>Returned requests: {apiResult.requestCount ?? 'n/a'}</Text>
          {apiResult.error ? <Text>{apiResult.error}</Text> : null}
        </Stack>
      ) : null}
    </Stack>
  );
};

ForgeReconciler.render(<PortalProbe />);
