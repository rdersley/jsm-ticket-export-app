import React, { useEffect, useState } from 'react';
import ForgeReconciler, { Button, Heading, Select, Stack, Text, Textfield } from '@forge/react';
import { invoke } from '@forge/bridge';

const Admin = () => {
  const [desks, setDesks] = useState([]);
  const [desk, setDesk] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    invoke('poc:service-desks', {})
      .then(rows => {
        const values = Array.isArray(rows) ? rows : [];
        setDesks(values);
        const test = values.find(d => d.projectName === 'Testing' || d.projectKey === 'TEST');
        if (test) setDesk(String(test.id));
        else if (values[0]) setDesk(String(values[0].id));
      })
      .catch(e => setMessage(e?.message || String(e)));
  }, []);

  const publish = async () => {
    setBusy(true);
    setMessage('Creating a customer-visible request and publishing an Excel attachment…');
    try {
      const result = await invoke('poc:publish', { email, serviceDeskId: desk });
      setMessage(`Published ${result.filename} on ${result.issueKey} for ${result.customer}. Request type: ${result.requestType}.`);
    } catch (e) {
      setMessage(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack space="space.250">
      <Heading size="medium">Published Report POC</Heading>
      <Text>This creates a tiny backend-generated XLSX, publishes it as a public attachment on a JSM customer request, and lets the resolver-free portal module discover it.</Text>
      <Select
        label="Service project"
        value={desks.find(d => String(d.id) === desk) ? { label: desks.find(d => String(d.id) === desk).projectName, value: desk } : null}
        options={desks.map(d => ({ label: `${d.projectName} (${d.id})`, value: String(d.id) }))}
        onChange={option => setDesk(option?.value || '')}
      />
      <Textfield label="Portal customer email" value={email} onChange={e => setEmail(e.target.value)} placeholder="customer@example.com" />
      <Button appearance="primary" isDisabled={busy || !desk || !email.trim()} onClick={publish}>
        {busy ? 'Publishing…' : 'Publish test Excel report'}
      </Button>
      {message ? <Text>{message}</Text> : null}
    </Stack>
  );
};

ForgeReconciler.render(<Admin />);
