import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { invoke } from '@forge/bridge';
import './styles.css';

const downloadBase64 = (base64, filename, mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename || 'weekly-sd-hardware-report.xlsx';
  anchor.click();
  URL.revokeObjectURL(url);
};

const iso = date => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const lastCompletedWeek = () => {
  const now = new Date();
  const currentDay = now.getDay();
  const daysSinceMonday = (currentDay + 6) % 7;
  const thisMonday = new Date(now);
  thisMonday.setHours(0, 0, 0, 0);
  thisMonday.setDate(now.getDate() - daysSinceMonday);
  const start = new Date(thisMonday);
  start.setDate(start.getDate() - 7);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { startDate: iso(start), endDate: iso(end) };
};

const parseList = value => String(value || '').split(',').map(x => x.trim()).filter(Boolean);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function App() {
  const defaultDates = useMemo(lastCompletedWeek, []);
  const [form, setForm] = useState({
    startDate: defaultDates.startDate,
    endDate: defaultDates.endDate,
    sdProjectKey: 'SD',
    hwProjectKey: 'HW',
    sdJql: 'project = SD',
    hwJql: 'project = HW',
    dateSentFieldId: 'customfield_10433',
    clientFieldId: '',
    receivedStatuses: '',
    awaitingDispatchStatuses: '',
    awaitingReturnStatuses: '',
    maxIssues: 5000
  });
  const [repair, setRepair] = useState({
    jql: 'project = HW AND statusCategory = Done AND resolution IS EMPTY',
    resolutionName: 'Done',
    maxIssues: 10000
  });
  const [busy, setBusy] = useState(false);
  const [repairBusy, setRepairBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [repairMessage, setRepairMessage] = useState('');
  const [repairSummary, setRepairSummary] = useState(null);
  const [lastResult, setLastResult] = useState(null);

  useEffect(() => {
    invoke('report:hardware-weekly:defaults').then(defaults => {
      if (!defaults) return;
      setForm(current => ({
        ...current,
        ...defaults,
        startDate: current.startDate,
        endDate: current.endDate,
        receivedStatuses: (defaults.receivedStatuses || []).join(', '),
        awaitingDispatchStatuses: (defaults.awaitingDispatchStatuses || []).join(', '),
        awaitingReturnStatuses: (defaults.awaitingReturnStatuses || []).join(', ')
      }));
    }).catch(() => {});

    invoke('report:resolution-repair:defaults').then(defaults => {
      if (defaults) setRepair(current => ({ ...current, ...defaults }));
    }).catch(() => {});
  }, []);

  const set = (name, value) => setForm(f => ({ ...f, [name]: value }));
  const setRepairField = (name, value) => setRepair(f => ({ ...f, [name]: value }));

  const generate = async () => {
    setBusy(true);
    setMessage('Queuing the SD and HW report…');
    setLastResult(null);
    let jobId = null;
    try {
      const payload = {
        ...form,
        maxIssues: Number(form.maxIssues || 5000),
        receivedStatuses: parseList(form.receivedStatuses),
        awaitingDispatchStatuses: parseList(form.awaitingDispatchStatuses),
        awaitingReturnStatuses: parseList(form.awaitingReturnStatuses)
      };

      const started = await invoke('report:hardware-weekly:start', payload);
      jobId = started?.jobId;
      if (!jobId) throw new Error('The report could not be queued.');
      setMessage('Running SD and HW Jira queries in the background. You can keep this page open while it finishes…');

      for (let attempt = 0; attempt < 450; attempt++) {
        const status = await invoke('report:run:status', { jobId });
        if (status?.state === 'ready') {
          let base64 = '';
          for (let i = 0; i < Number(status.chunkCount || 0); i++) {
            base64 += await invoke('report:run:chunk', { jobId, index: i });
          }
          downloadBase64(base64, status.filename || 'weekly-sd-hardware-report.xlsx');
          setLastResult({
            summary: status.summary || {},
            counts: status.counts || {},
            warningCount: Number(status.warningCount || 0)
          });
          setMessage(`Report created in ${status.durationMs ? Math.round(status.durationMs / 1000) + 's' : 'the background'}. SD rows: ${status.counts?.sdRows ?? 0}; HW rows: ${status.counts?.hwRows ?? 0}.`);
          await invoke('report:run:cleanup', { jobId }).catch(() => {});
          return;
        }
        if (status?.state === 'failed') throw new Error(status.message || 'Report generation failed.');
        if (status?.state === 'missing') throw new Error('The queued report could not be found.');
        await wait(2000);
      }
      throw new Error('The report is taking longer than expected. Please try again shortly.');
    } catch (error) {
      setMessage(error?.message || 'The report could not be generated.');
      if (jobId) await invoke('report:run:cleanup', { jobId }).catch(() => {});
    } finally {
      setBusy(false);
    }
  };

  const generateResolutionRepair = async () => {
    setRepairBusy(true);
    setRepairSummary(null);
    setRepairMessage('Queuing the historical resolution-date scan…');
    let jobId = null;
    try {
      const started = await invoke('report:resolution-repair:start', {
        ...repair,
        maxIssues: Number(repair.maxIssues || 10000)
      });
      jobId = started?.jobId;
      if (!jobId) throw new Error('The repair scan could not be queued.');
      setRepairMessage('Reading issue histories and reconstructing the original Done dates in the background…');

      for (let attempt = 0; attempt < 450; attempt++) {
        const status = await invoke('report:run:status', { jobId });
        if (status?.state === 'ready') {
          let base64 = '';
          for (let i = 0; i < Number(status.chunkCount || 0); i++) {
            base64 += await invoke('report:run:chunk', { jobId, index: i });
          }
          downloadBase64(base64, status.filename || 'jira-resolution-date-repair.csv', 'text/csv;charset=utf-8');
          setRepairSummary(status.summary || {});
          setRepairMessage(`Repair CSV created. Scanned ${status.summary?.scanned ?? status.issueCount ?? 0} tickets; ${status.summary?.ready ?? 0} have a historical resolved date ready to import; ${status.summary?.needsReview ?? 0} are flagged for review.`);
          await invoke('report:run:cleanup', { jobId }).catch(() => {});
          return;
        }
        if (status?.state === 'failed') throw new Error(status.message || 'Resolution repair scan failed.');
        if (status?.state === 'missing') throw new Error('The repair job could not be found.');
        await wait(2000);
      }
      throw new Error('The repair scan is taking longer than expected. Please try again shortly.');
    } catch (error) {
      setRepairMessage(error?.message || 'The resolution repair scan could not be completed.');
      if (jobId) await invoke('report:run:cleanup', { jobId }).catch(() => {});
    } finally {
      setRepairBusy(false);
    }
  };

  return <main>
    <header>
      <div>
        <div className="eyebrow">Nuvriqo Excel Report Manager</div>
        <h1>Weekly SD → Hardware Report</h1>
        <p>Run separate Jira queries for Service Desk demand and Hardware workload, then export one management workbook.</p>
      </div>
      <button className="primary" disabled={busy} onClick={generate}>{busy ? 'Generating…' : 'Generate Excel'}</button>
    </header>

    {message && <div className="notice">{message}</div>}

    <section className="panel">
      <div className="sectionHead">
        <div>
          <h2>Reporting period</h2>
          <p>The selected dates are automatically added to the two JQL queries.</p>
        </div>
      </div>
      <div className="grid two">
        <label>Start date<input type="date" value={form.startDate} onChange={e => set('startDate', e.target.value)} /></label>
        <label>End date<input type="date" value={form.endDate} onChange={e => set('endDate', e.target.value)} /></label>
      </div>
    </section>

    <section className="panel">
      <h2>SD demand query</h2>
      <p>Use this for crew-raised Service Desk tickets. Add the client condition here.</p>
      <div className="grid two">
        <label>SD project key<input value={form.sdProjectKey} onChange={e => set('sdProjectKey', e.target.value.toUpperCase())} /></label>
        <label>Maximum issues<input type="number" min="100" max="10000" value={form.maxIssues} onChange={e => set('maxIssues', e.target.value)} /></label>
      </div>
      <label>SD JQL<textarea rows="5" value={form.sdJql} onChange={e => set('sdJql', e.target.value)} placeholder={'project = SD AND "SD Client" = RYR'} /></label>
      <div className="hint">Example for one client: <code>project = SD AND "SD Client" = RYR</code></div>
    </section>

    <section className="panel">
      <h2>HW workload query</h2>
      <p>Use a separate Hardware query for the same client. The app uses this for created, open, sent, received and closed figures.</p>
      <div className="grid two">
        <label>HW project key<input value={form.hwProjectKey} onChange={e => set('hwProjectKey', e.target.value.toUpperCase())} /></label>
        <label>Date Sent field ID<input value={form.dateSentFieldId} onChange={e => set('dateSentFieldId', e.target.value)} /></label>
      </div>
      <label>HW JQL<textarea rows="5" value={form.hwJql} onChange={e => set('hwJql', e.target.value)} placeholder={'project = HW AND "SD Client" = RYR'} /></label>
      <div className="hint">Example for one client: <code>project = HW AND "SD Client" = RYR</code></div>
    </section>

    <section className="panel">
      <h2>Hardware workflow mapping</h2>
      <p>Comma-separate multiple statuses. You can leave these blank initially: Date Sent is used as a fallback for outstanding categories, and received statuses are auto-detected from names containing received/returned/back.</p>
      <label>Received back status(es)<input value={form.receivedStatuses} onChange={e => set('receivedStatuses', e.target.value)} placeholder="Device Received, Returned from Crew" /></label>
      <div className="grid two">
        <label>Awaiting dispatch status(es)<input value={form.awaitingDispatchStatuses} onChange={e => set('awaitingDispatchStatuses', e.target.value)} placeholder="Ready to Send, To Dispatch" /></label>
        <label>Awaiting return status(es)<input value={form.awaitingReturnStatuses} onChange={e => set('awaitingReturnStatuses', e.target.value)} placeholder="Waiting Return, Awaiting Device" /></label>
      </div>
      <label>Client field ID (optional)<input value={form.clientFieldId} onChange={e => set('clientFieldId', e.target.value)} placeholder="customfield_12345" /><small>Only needed if you also want the client value shown as a column in the workbook. The filtering itself is done by your JQL.</small></label>
    </section>

    {lastResult && <section className="panel result">
      <h2>Latest result</h2>
      <div className="stats">
        <div><strong>{lastResult.summary?.sdRaised ?? 0}</strong><span>SD raised</span></div>
        <div><strong>{lastResult.summary?.sdEscalated ?? 0}</strong><span>Escalated to HW</span></div>
        <div><strong>{lastResult.summary?.hwCreated ?? 0}</strong><span>HW created</span></div>
        <div><strong>{lastResult.summary?.devicesSent ?? 0}</strong><span>Devices sent</span></div>
        <div><strong>{lastResult.summary?.devicesReceived ?? 0}</strong><span>Received back</span></div>
        <div><strong>{lastResult.summary?.outstandingDevices ?? 0}</strong><span>Outstanding</span></div>
      </div>
      {lastResult.warningCount > 0 && <div className="warning">{lastResult.warningCount} Jira changelog item(s) could not be read. The workbook includes the warning details.</div>}
    </section>}

    <section className="panel">
      <div className="sectionHead">
        <div>
          <h2>Repair missing historical Resolved Dates</h2>
          <p>For tickets already in a Done-category status but missing Jira Resolution, scan their changelog and build a bulk-import CSV using the original transition date.</p>
        </div>
        <button className="primary" disabled={repairBusy} onClick={generateResolutionRepair}>{repairBusy ? 'Scanning…' : 'Generate repair CSV'}</button>
      </div>
      {repairMessage && <div className="notice">{repairMessage}</div>}
      <label>Affected-ticket JQL<textarea rows="4" value={repair.jql} onChange={e => setRepairField('jql', e.target.value)} /></label>
      <div className="grid two">
        <label>Resolution value<input value={repair.resolutionName} onChange={e => setRepairField('resolutionName', e.target.value)} placeholder="Done" /><small>This must match a Resolution value available in Jira when you import the CSV.</small></label>
        <label>Maximum tickets<input type="number" min="1" max="10000" value={repair.maxIssues} onChange={e => setRepairField('maxIssues', e.target.value)} /></label>
      </div>
      <div className="hint">The CSV contains Issue Key, Resolution and Resolved plus audit columns. During Jira CSV import map <strong>Issue Key</strong>, <strong>Resolution</strong> and <strong>Resolved</strong>. Use date format <code>yyyy-MM-dd'T'HH:mm:ss.SSSZ</code>. Rows marked <strong>Needs Review = YES</strong> were reopened/reclosed or required a fallback and should be checked before import.</div>
      {repairSummary && <div className="stats">
        <div><strong>{repairSummary.scanned ?? 0}</strong><span>Scanned</span></div>
        <div><strong>{repairSummary.ready ?? 0}</strong><span>Ready to import</span></div>
        <div><strong>{repairSummary.needsReview ?? 0}</strong><span>Needs review</span></div>
        <div><strong>{repairSummary.noDate ?? 0}</strong><span>No date found</span></div>
      </div>}
    </section>
  </main>;
}

createRoot(document.getElementById('root')).render(<App />);