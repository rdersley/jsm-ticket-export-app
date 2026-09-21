import React, { useState } from 'react';
import ForgeReconciler, { Button, Heading, Stack, Text } from '@forge/react';
import { objectStore } from '@forge/bridge';

const KEY = 'portal-poc/latest-report.xlsx';

const App = () => {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const download = async () => {
    setBusy(true);
    setMessage('Preparing download…');
    try {
      const results = await objectStore.download({
        functionKey: 'object-download',
        keys: [KEY]
      });
      const result = results?.[0];
      if (!result?.success || !result?.blob) {
        throw new Error(result?.error || 'Object Store did not return the report file.');
      }
      setMessage('Object Store download succeeded.');
    } catch (error) {
      setMessage(error?.message || String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack space="space.150">
      <Heading size="small">Object Store Portal Test</Heading>
      <Text>No JSM ticket is used. Click below to test the customer download path.</Text>
      <Button appearance="primary" isDisabled={busy} onClick={download}>
        {busy ? 'Preparing…' : 'Download Excel'}
      </Button>
      {message ? <Text>{message}</Text> : null}
    </Stack>
  );
};

ForgeReconciler.render(<App />);
