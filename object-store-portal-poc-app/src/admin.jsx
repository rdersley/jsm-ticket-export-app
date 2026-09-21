import React, { useState } from 'react';
import ForgeReconciler, { Button, Heading, Stack, Text } from '@forge/react';
import { invoke } from '@forge/bridge';

const App = () => {
  const [message, setMessage] = useState('No Object Store test workbook has been published yet.');
  const [busy, setBusy] = useState(false);

  const publish = async () => {
    setBusy(true);
    setMessage('Generating and storing workbook…');
    try {
      const result = await invoke('poc:publish', {});
      setMessage(`Published ${result.filename} to Forge Object Store (${result.bytes} bytes). Now test the portal download button.`);
    } catch (error) {
      setMessage(error?.message || String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack space="space.250">
      <Heading size="medium">Object Store Portal POC</Heading>
      <Text>This test stores an XLSX in Forge Object Store instead of creating a JSM request.</Text>
      <Button appearance="primary" isDisabled={busy} onClick={publish}>
        {busy ? 'Publishing…' : 'Publish Object Store test report'}
      </Button>
      <Text>{message}</Text>
    </Stack>
  );
};

ForgeReconciler.render(<App />);
