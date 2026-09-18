import React, { useEffect, useState } from 'react';
import ForgeReconciler, { Heading, Spinner, Stack, Text } from '@forge/react';
import { invoke } from '@forge/bridge';

const PortalProbe = () => {
  const [value, setValue] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    invoke('probe', {})
      .then((result) => setValue(result?.message || 'Portal resolver responded.'))
      .catch((e) => {
        setError(e?.message || String(e));
        setValue('');
      });
  }, []);

  return <Stack space="space.100">
    <Heading size="small">Reports</Heading>
    {value === null ? <Spinner /> : null}
    {value ? <Text>{value}</Text> : null}
    {error ? <Text>{error}</Text> : null}
  </Stack>;
};

ForgeReconciler.render(<PortalProbe />);
