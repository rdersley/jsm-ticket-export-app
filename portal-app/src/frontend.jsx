import React, { useEffect, useState } from 'react';
import ForgeReconciler, { Heading, Spinner, Stack, Text } from '@forge/react';
import { invoke } from '@forge/bridge';

const PortalReports = () => {
  const [state, setState] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    invoke('portal:list', {})
      .then(setState)
      .catch((e) => setError(e?.message || String(e)));
  }, []);

  return (
    <Stack space="space.100">
      <Heading size="small">Reports</Heading>
      {!state && !error ? <Spinner /> : null}
      {state ? <Text>Portal Reports customer service is connected without requesting Jira access.</Text> : null}
      {error ? <Text>Portal Reports could not load: {error}</Text> : null}
    </Stack>
  );
};

ForgeReconciler.render(<PortalReports />);
