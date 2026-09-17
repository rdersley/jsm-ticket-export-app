import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  Button,
  Heading,
  Inline,
  Lozenge,
  Spinner,
  Stack,
  Text
} from '@forge/react';
import { invoke } from '@forge/bridge';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitForJob(jobId) {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    const status = await invoke('portal:job-status', { jobId });
    if (status?.state === 'ready') return status;
    if (status?.state === 'failed') throw new Error(status.message || 'Report generation failed.');
    if (status?.state === 'missing') throw new Error('The report job could not be found.');
    await sleep(2000);
  }
  throw new Error('The report is still running. Please try again shortly.');
}

const PortalReports = () => {
  const [reports, setReports] = useState(null);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');

  const refresh = async () => {
    try {
      setMessage('');
      const rows = await invoke('portal:list', {});
      setReports(Array.isArray(rows) ? rows : []);
    } catch (error) {
      setReports([]);
      setMessage(error?.message || 'Could not load available reports.');
    }
  };

  useEffect(() => { refresh(); }, []);

  const generate = async report => {
    setBusy(report.id);
    setMessage(`Generating ${report.name}…`);
    let jobId = '';
    try {
      const started = await invoke('portal:run', { reportId: report.id });
      jobId = started?.jobId || '';
      if (!jobId) throw new Error('The report job could not be started.');
      const status = await waitForJob(jobId);
      setMessage(`${report.name} generated successfully. ${status.issueCount ?? 0} work items are ready.`);
      await refresh();
    } catch (error) {
      setMessage(error?.message || 'Could not generate the report.');
      if (jobId) await invoke('portal:job-cleanup', { jobId }).catch(() => {});
    } finally {
      setBusy('');
    }
  };

  if (reports === null) {
    return <Stack space="space.200">
      <Heading size="large">Reports</Heading>
      <Spinner />
      <Text>Loading your available reports…</Text>
    </Stack>;
  }

  return <Stack space="space.300">
    <Stack space="space.100">
      <Inline space="space.100" alignBlock="center">
        <Heading size="large">Reports</Heading>
        <Lozenge appearance={reports.length ? 'success' : 'default'}>{reports.length} available</Lozenge>
      </Inline>
      <Text>View the Excel reports your administrator has made available to you.</Text>
    </Stack>

    {message ? <Text>{message}</Text> : null}

    {reports.length === 0 ? <Stack space="space.100">
      <Heading size="medium">No reports available</Heading>
      <Text>Your account does not currently have access to any published reports.</Text>
    </Stack> : reports.map(report => <Stack key={report.id} space="space.100">
      <Inline space="space.100" alignBlock="center">
        <Heading size="medium">{report.name}</Heading>
        {report.latest ? <Lozenge appearance="success">Published</Lozenge> : <Lozenge appearance="default">No published copy</Lozenge>}
      </Inline>
      {report.description ? <Text>{report.description}</Text> : null}
      {report.latest ? <Text>Latest copy: {new Date(report.latest.generatedAt).toLocaleString()} · {report.latest.issueCount ?? 0} work items</Text> : null}
      <Inline space="space.100">
        {report.allowRun ? <Button
          appearance="primary"
          onClick={() => generate(report)}
          isDisabled={busy === report.id}
        >{busy === report.id ? 'Generating…' : 'Generate report'}</Button> : null}
      </Inline>
      {report.allowDownload && report.latest ? <Text>Download support is temporarily hidden while the portal modal is being stabilised. The published copy remains stored securely.</Text> : null}
    </Stack>)}
  </Stack>;
};

ForgeReconciler.render(<PortalReports />);
