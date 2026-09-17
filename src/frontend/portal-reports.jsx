import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  Button,
  FileCard,
  Heading,
  Inline,
  Lozenge,
  Spinner,
  Stack,
  Text
} from '@forge/react';
import { invoke } from '@forge/bridge';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function readChunks({ jobId, reportId, chunkCount, latest = false }) {
  let base64 = '';
  for (let i = 0; i < Number(chunkCount || 0); i += 1) {
    base64 += latest
      ? await invoke('portal:latest-chunk', { reportId, index: i })
      : await invoke('portal:job-chunk', { jobId, index: i });
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
}

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
  const [generated, setGenerated] = useState({});

  const refresh = async () => {
    try {
      setMessage('');
      const rows = await invoke('portal:list', {});
      setReports(rows || []);
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
      setGenerated(current => ({ ...current, [report.id]: { ...status, jobId } }));
      setMessage(`${report.name} is ready to download.`);
      await refresh();
    } catch (error) {
      setMessage(error?.message || 'Could not generate the report.');
      if (jobId) await invoke('portal:job-cleanup', { jobId }).catch(() => {});
    } finally {
      setBusy('');
    }
  };

  const downloadGenerated = report => async () => {
    const status = generated[report.id];
    if (!status?.jobId) throw new Error('Generate the report first.');
    return readChunks({
      jobId: status.jobId,
      chunkCount: status.chunkCount,
      latest: false
    });
  };

  const downloadLatest = report => async () => {
    const meta = await invoke('portal:latest-meta', { reportId: report.id });
    if (!meta) throw new Error('No published copy is available yet.');
    return readChunks({
      reportId: report.id,
      chunkCount: meta.chunkCount,
      latest: true
    });
  };

  if (reports === null) return <Spinner />;

  return <Stack space="space.300">
    <Stack space="space.100">
      <Inline space="space.100" alignBlock="center">
        <Heading size="large">Reports</Heading>
        <Lozenge appearance={reports.length ? 'success' : 'default'}>{reports.length} available</Lozenge>
      </Inline>
      <Text>Download approved Excel reports or generate an up-to-date copy when your administrator has enabled it.</Text>
    </Stack>

    {message ? <Text>{message}</Text> : null}

    {reports.length === 0 ? <Stack space="space.100">
      <Heading size="medium">No reports available</Heading>
      <Text>Your account does not currently have access to any published reports.</Text>
    </Stack> : reports.map(report => {
      const generatedStatus = generated[report.id];
      return <Stack key={report.id} space="space.150">
        <Inline space="space.100" alignBlock="center">
          <Heading size="medium">{report.name}</Heading>
          {report.latest ? <Lozenge appearance="success">Published</Lozenge> : <Lozenge>No published copy</Lozenge>}
        </Inline>
        {report.description ? <Text>{report.description}</Text> : null}
        {report.latest ? <Text>Latest copy: {new Date(report.latest.generatedAt).toLocaleString()} · {report.latest.issueCount ?? 0} work items</Text> : null}

        <Inline space="space.150" alignBlock="start">
          {report.allowRun ? <Button
            appearance="primary"
            onClick={() => generate(report)}
            isDisabled={busy === report.id}
          >{busy === report.id ? 'Generating…' : 'Generate report'}</Button> : null}
        </Inline>

        {report.allowDownload && report.latest ? <FileCard
          fileName={report.latest.filename || `${report.name}.xlsx`}
          fileSize={Number(report.latest.bytes || 0) || undefined}
          fileType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onDownload={downloadLatest(report)}
        /> : null}

        {generatedStatus ? <Stack space="space.050">
          <Text>Your newly generated copy is ready:</Text>
          <FileCard
            fileName={generatedStatus.filename || `${report.name}.xlsx`}
            fileSize={Number(generatedStatus.bytes || 0) || undefined}
            fileType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onDownload={downloadGenerated(report)}
          />
        </Stack> : null}
      </Stack>;
    })}
  </Stack>;
};

ForgeReconciler.render(<PortalReports />);
