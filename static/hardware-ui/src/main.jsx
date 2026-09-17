import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { invoke } from '@forge/bridge';
import './styles.css';

const downloadBase64 = (base64, filename) => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
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
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
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
  }, []);

  const set = (name, value) => setForm(f => ({ ...f, [name]: value }));

  const generate = async () => {
    setBusy(true);
    setMessage('Running SD and HW Jira queries and building the workbook…');
    setLastResult(null);
    try {
      const payload = {
        ...form,
        maxIssues: Number(form.maxIssues || 5000),
        receivedStatuses: parseList(form.receivedStatuses),
        awaitingDispatchStatuses: parseList(form.awaitingDispatchStatuses),
        awaitingReturnStatuses: parseList(form.awaitingReturnStatuses)
      };
      const result = await invoke('report:hardware-weekly:run', payload);
      downloadBase64(result.workbookBase64, result.filename);
      setLastResult(result);
      setMessage(`Report created. SD rows: ${result.counts?.sdRows ?? 0}; HW rows: ${result.counts?.hwRows ?? 0}.`);
    } catch (error) {
      setMessage(error?.message || 'The report could not be generated.');
    } finally {
      setBusy(false);
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
      {lastResult.warnings?.length > 0 && <div className="warning">{lastResult.warnings.length} Jira changelog item(s) could not be read. The workbook includes the warning details.</div>}
    </section>}
  </main>;
}

createRoot(document.getElementById('root')).render(<App />);
