import React, { useEffect, useState } from 'react';
import ForgeReconciler, { Heading, Spinner, Stack, Text } from '@forge/react';
import { invoke } from '@forge/bridge';

const PortalReports = () => {
  const [probe, setProbe] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    invoke('portal:probe', {})
      .then(setProbe)
      .catch((e) => setError(e?.message || String(e)));
  }, []);

  return (
    <Stack space="space.100">
      <Heading size="small">Reports</Heading>
      {!probe && !error ? <Spinner /> : null}
      {probe ? <Text>Portal resolver loaded without Jira API access. Account type: {probe.accountType || 'unknown'}.</Text> : null}
      {error ? <Text>Resolver probe failed: {error}</Text> : null}
    </Stack>
  );
};

ForgeReconciler.render(<PortalReports />);
