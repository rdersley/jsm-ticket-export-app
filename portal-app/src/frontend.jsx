import React, { useEffect, useState } from 'react';
import ForgeReconciler, { Button, Heading, Inline, Lozenge, Spinner, Stack, Text } from '@forge/react';
import { invoke, router } from '@forge/bridge';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

const PortalReports = () => {
  const [reports, setReports] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const refresh = async () => {
    setError('');
    try {
      const items = await invoke('portal:list', {});
      setReports(Array.isArray(items) ? items : []);
    } catch (e) {
      setReports([]);
      setError(e?.message || String(e));
    }
  };

  useEffect(() => { refresh(); }, []);

  const run = async report => {
    setBusy(report.id);
    setError('');
    setMessage(`Generating ${report.name}…`);
    let jobId = '';
    try {
      const started = await invoke('portal:run', { reportId: report.id });
      jobId = started?.jobId || '';
      if (!jobId) throw new Error('The report could not be queued.');

      for (let attempt = 0; attempt < 450; attempt += 1) {
        const status = await invoke('portal:job-status', { jobId });
        if (status?.state === 'ready') {
          setMessage(`${report.name} is ready${status.issueCount != null ? ` · ${status.issueCount} work items` : ''}.`);
          await invoke('portal:job-cleanup', { jobId }).catch(() => {});
          const items = await invoke('portal:list', {}).catch(() => []);
          setReports(Array.isArray(items) ? items : []);
          const fresh = Array.isArray(items) ? items.find(item => item.id === report.id) : null;
          if (fresh?.downloadUrl) {
            setMessage(`${report.name} is ready${status.issueCount != null ? ` · ${status.issueCount} work items` : ''}. Starting download…`);
            await router.open(fresh.downloadUrl);
          }
          return;
        }
        if (status?.state === 'failed') throw new Error(status.message || 'Report generation failed.');
        if (status?.state === 'missing') throw new Error('The report job could not be found.');
        await wait(2000);
      }
      throw new Error('The report is taking longer than expected. Please try again shortly.');
    } catch (e) {
      setError(e?.message || String(e));
      setMessage('');
      if (jobId) await invoke('portal:job-cleanup', { jobId }).catch(() => {});
    } finally {
      setBusy('');
    }
  };

  return (
    <Stack space="space.300">
      <Stack space="space.100">
        <Heading size="small">Reports</Heading>
        <Text>Download reports published for you, or generate a fresh copy when enabled.</Text>
      </Stack>

      {message ? <Text>{message}</Text> : null}
      {error ? <Text>{error}</Text> : null}
      {reports === null ? <Stack space="space.100"><Spinner /><Text>Loading your available reports…</Text></Stack> : null}
      {reports !== null && reports.length === 0 ? <Text>No portal reports are currently available for your account.</Text> : null}

      {reports?.map(report => (
        <Stack key={report.id} space="space.100">
          <Inline space="space.100" alignBlock="center">
            <Heading size="small">{report.name}</Heading>
            {report.latest ? <Lozenge appearance="success">Published</Lozenge> : <Lozenge appearance="default">No published copy</Lozenge>}
          </Inline>
          {report.description ? <Text>{report.description}</Text> : null}
          {report.latest ? <Text>Latest: {new Date(report.latest.generatedAt).toLocaleString()}{report.latest.issueCount != null ? ` · ${report.latest.issueCount} work items` : ''}</Text> : null}

          {report.allowDownload && report.latest && report.downloadUrl ? (
            <Inline space="space.100">
              <Button appearance="primary" onClick={() => router.open(report.downloadUrl)}>
                Download Excel
              </Button>
            </Inline>
          ) : null}

          {report.allowRun ? (
            <Inline space="space.100">
              <Button appearance="primary" isDisabled={busy === report.id} onClick={() => run(report)}>
                {busy === report.id ? 'Generating…' : 'Generate fresh report'}
              </Button>
            </Inline>
          ) : null}
        </Stack>
      ))}
    </Stack>
  );
};

ForgeReconciler.render(<PortalReports />);
