import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { invoke } from '@forge/bridge';
import './styles.css';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function base64ToBlob(base64, type) {
  const clean = String(base64 || '').replace(/\s+/g, '');
  const binary = window.atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'report.xlsx';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 1000);
}

function App() {
  const [reports, setReports] = useState(null);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

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

  const download = async report => {
    setBusy('download:' + report.id);
    setMessage('');
    setError('');
    try {
      const meta = await invoke('portal:latest-meta', { reportId: report.id });
      const count = Number(meta?.chunkCount || 0);
      if (!count) throw new Error('There is no published report available to download yet.');

      let base64 = '';
      for (let i = 0; i < count; i += 1) {
        const part = await invoke('portal:latest-chunk', { reportId: report.id, index: i });
        if (typeof part !== 'string') throw new Error('A report data chunk could not be loaded.');
        base64 += part;
      }

      const blob = base64ToBlob(
        base64,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      triggerDownload(blob, meta?.filename || report.latest?.filename || report.name + '.xlsx');
      setMessage('Download started.');
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusy('');
    }
  };

  const run = async report => {
    setBusy('run:' + report.id);
    setError('');
    setMessage('Generating ' + report.name + '…');
    let jobId = '';
    try {
      const started = await invoke('portal:run', { reportId: report.id });
      jobId = started?.jobId || '';
      if (!jobId) throw new Error('The report could not be queued.');

      for (let attempt = 0; attempt < 450; attempt += 1) {
        const status = await invoke('portal:job-status', { jobId });
        if (status?.state === 'ready') {
          setMessage(report.name + ' is ready' + (status.issueCount != null ? ' · ' + status.issueCount + ' work items' : '') + '.');
          await invoke('portal:job-cleanup', { jobId }).catch(() => {});
          await refresh();
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

  return <div className="wrap">
    <h2>Reports</h2>
    <p>Download reports published for you, or generate a fresh copy when enabled.</p>

    {message && <div className="notice">{message}</div>}
    {error && <div className="error">{error}</div>}

    {reports === null && <p>Loading your available reports…</p>}
    {reports !== null && reports.length === 0 && <p>No portal reports are currently available for your account.</p>}

    {(reports || []).map(report => <section className="report" key={report.id}>
      <div className="titleRow">
        <h3>{report.name}</h3>
        <span className={report.latest ? 'pill published' : 'pill'}>{report.latest ? 'Published' : 'No published copy'}</span>
      </div>

      {report.description && <p>{report.description}</p>}
      {report.latest && <p className="meta">
        Latest: {new Date(report.latest.generatedAt).toLocaleString()}
        {report.latest.issueCount != null ? ' · ' + report.latest.issueCount + ' work items' : ''}
      </p>}

      <div className="actions">
        {report.allowDownload && report.latest && <button
          className="primary"
          disabled={busy === 'download:' + report.id}
          onClick={() => download(report)}
        >
          {busy === 'download:' + report.id ? 'Preparing download…' : 'Download Excel'}
        </button>}

        {report.allowRun && <button
          disabled={busy === 'run:' + report.id}
          onClick={() => run(report)}
        >
          {busy === 'run:' + report.id ? 'Generating…' : 'Generate fresh report'}
        </button>}
      </div>
    </section>)}
  </div>;
}

createRoot(document.getElementById('root')).render(<App />);
