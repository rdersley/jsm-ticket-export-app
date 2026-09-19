import React, { useEffect, useState } from 'react';
import ForgeReconciler, { Button, Heading, Stack, Text, TextArea } from '@forge/react';
import { invoke } from '@forge/bridge';

const CompanionAdmin = () => {
  const [status, setStatus] = useState(null);
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      setStatus(await invoke('companion:status', {}));
    } catch (e) {
      setMessage(e?.message || String(e));
    }
  };

  useEffect(() => { load(); }, []);

  const connect = async () => {
    setBusy(true);
    setMessage('');
    try {
      const next = await invoke('companion:connect', { code });
      setStatus(next);
      setCode('');
      setMessage('Portal Reports Companion is connected.');
    } catch (e) {
      setMessage(e?.message || 'Could not connect the companion.');
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    setMessage('');
    try {
      const next = await invoke('companion:disconnect', {});
      setStatus(next);
      setMessage('Portal Reports Companion has been disconnected.');
    } catch (e) {
      setMessage(e?.message || 'Could not disconnect the companion.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack space="space.300">
      <Heading size="medium">Portal Reports Companion</Heading>
      <Text>
        This lightweight companion displays Excel Report Manager reports to Jira Service Management customers without asking customers to grant Jira access.
      </Text>

      {status?.connected ? (
        <Stack space="space.150">
          <Text>Connected to Excel Report Manager{status.host ? ` via ${status.host}` : ''}.</Text>
          <Button isDisabled={busy} onClick={disconnect}>Disconnect</Button>
        </Stack>
      ) : (
        <Stack space="space.150">
          <Text>
            In Excel Report Manager, open Apps → Portal Reports and copy the Companion setup code. Paste it below to connect this site.
          </Text>
          <TextArea
            label="Companion setup code"
            value={code}
            onChange={e => setCode(e.target.value)}
            placeholder="Paste the setup code from Excel Report Manager"
          />
          <Button appearance="primary" isDisabled={busy || !code.trim()} onClick={connect}>
            {busy ? 'Connecting…' : 'Connect companion'}
          </Button>
        </Stack>
      )}

      {message ? <Text>{message}</Text> : null}
    </Stack>
  );
};

ForgeReconciler.render(<CompanionAdmin />);
