import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { invoke, view } from '@forge/bridge';
import './styles.css';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function downloadBase64(base64, filename) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'jira-report.xlsx';
  a.click();
  URL.revokeObjectURL(url);
}

function App() {
  const [portalId, setPortalId] = useState('');
  const [reports, setReports] = useState([]);
  const [busy, setBusy] = useState({});
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async pid => {
    setLoading(true);
    try {
      const rows = await invoke('portal:list', { portalId: pid });
      setReports(rows || []);
    } catch (e) {
      setMessage(e?.message || 'Could not load available reports.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    (async () => {
      const context = await view.getContext();
      const pid = String(context?.extension?.portal?.id || context?.portal?.id || '');
      setPortalId(pid);
      await load(pid);
    })();
  }, []);

  const readJob = async jobId => {
    for (let attempt = 0; attempt < 300; attempt++) {
      const status = await invoke('portal:job-status', { jobId });
      if (status?.state === 'ready') return status;
      if (status?.state === 'failed') throw new Error(status.message || 'Report generation failed.');
      if (status?.state === 'missing') throw new Error('The report job could not be found.');
      await sleep(2000);
    }
    throw new Error('The report is still running. Please try again shortly.');
  };

  const run = async report => {
    setBusy(b => ({ ...b, [report.id]: true }));
    setMessage(`Generating ${report.name}…`);
    let jobId;
    try {
      const started = await invoke('portal:run', { reportId: report.id, portalId });
      jobId = started.jobId;
      const status = await readJob(jobId);
      let base64 = '';
      for (let i = 0; i < Number(status.chunkCount || 0); i++) {
        base64 += await invoke('portal:job-chunk', { jobId, index: i });
      }
      downloadBase64(base64, status.filename);
      setMessage(`${report.name} generated successfully.`);
      await load(portalId);
    } catch (e) {
      setMessage(e?.message || 'Could not generate the report.');
    } finally {
      if (jobId) await invoke('portal:job-cleanup', { jobId }).catch(() => {});
      setBusy(b => ({ ...b, [report.id]: false }));
    }
  };

  const downloadLatest = async report => {
    setBusy(b => ({ ...b, [report.id]: true }));
    try {
      const meta = await invoke('portal:latest-meta', { reportId: report.id, portalId });
      if (!meta) throw new Error('No published copy is available yet.');
      let base64 = '';
      for (let i = 0; i < Number(meta.chunkCount || 0); i++) {
        base64 += await invoke('portal:latest-chunk', { reportId: report.id, portalId, index: i });
      }
      downloadBase64(base64, meta.filename);
    } catch (e) {
      setMessage(e?.message || 'Could not download the report.');
    } finally {
      setBusy(b => ({ ...b, [report.id]: false }));
    }
  };

  return <main>
    <header>
      <div>
        <div className="eyebrow">Nuvriqo</div>
        <h1>Reports</h1>
        <p>Download approved Excel reports or generate an up-to-date copy when your administrator has enabled it.</p>
      </div>
    </header>

    {message && <div className="notice">{message}</div>}
    {loading ? <section className="panel"><p>Loading reports…</p></section> :
      !reports.length ? <section className="panel empty"><h2>No reports available</h2><p>Your account does not currently have access to any published reports.</p></section> :
      <section className="panel">
        {reports.map(report => <article className="report" key={report.id}>
          <div className="reportText">
            <h2>{report.name}</h2>
            {report.description && <p>{report.description}</p>}
            {report.latest ? <small>Latest copy: {new Date(report.latest.generatedAt).toLocaleString()} · {report.latest.issueCount ?? 0} work items</small> : <small>No published copy yet.</small>}
          </div>
          <div className="actions">
            {report.allowDownload && <button disabled={busy[report.id]} onClick={() => downloadLatest(report)}>Download latest</button>}
            {report.allowRun && <button className="primary" disabled={busy[report.id]} onClick={() => run(report)}>{busy[report.id] ? 'Generating…' : 'Generate report'}</button>}
          </div>
        </article>)}
      </section>
    }
  </main>;
}

createRoot(document.getElementById('root')).render(<App/>);
