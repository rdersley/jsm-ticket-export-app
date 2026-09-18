import React, { useEffect, useState } from 'react';
import ForgeReconciler, { Heading, Spinner, Stack, Text } from '@forge/react';
import { invoke } from '@forge/bridge';

const PortalProbe = () => {
  const [state, setState] = useState({ loading: true, message: '' });

  useEffect(() => {
    invoke('probe', {})
      .then(result => setState({ loading: false, message: result?.message || 'Backend resolver connected.' }))
      .catch(error => setState({ loading: false, message: error?.message || String(error) }));
  }, []);

  return (
    <Stack space="space.100">
      <Heading size="small">Reports</Heading>
      {state.loading ? <Spinner /> : <Text>{state.message}</Text>}
    </Stack>
  );
};

ForgeReconciler.render(<PortalProbe />);
