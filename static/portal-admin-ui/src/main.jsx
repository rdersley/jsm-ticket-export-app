import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { invoke } from '@forge/bridge';
import './styles.css';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const unique = values => [...new Set((values || []).map(String))];

function App() {
  const [reports, setReports] = useState([]);
  const [serviceDesks, setServiceDesks] = useState([]);
  const [selected, setSelected] = useState(null);
  const [customerQuery, setCustomerQuery] = useState('');
  const [customerResults, setCustomerResults] = useState([]);
  const [knownUsers, setKnownUsers] = useState({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const load = async () => {
    setBusy(true);
    try {
      const [rows, desks] = await Promise.all([
        invoke('portal-admin:list'),
        invoke('portal-admin:service-desks').catch(() => [])
      ]);
      setReports(rows || []);
      setServiceDesks(desks || []);
      if (selected) {
        const fresh = (rows || []).find(report => report.id === selected.id);
        if (fresh) setSelected(fresh);
      }
    } catch (error) {
      setMessage(error?.message || 'Could not load portal report settings.');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => { load(); }, []);

  const cfg = selected?.config || {};
  const patch = (key, value) => setSelected(report => ({
    ...report,
    config: { ...report.config, [key]: value }
  }));

  const selectedUsers = useMemo(() => unique(cfg.userAccountIds || []), [cfg.userAccountIds]);

  const toggleUser = accountId => {
    const users = new Set(cfg.userAccountIds || []);
    const id = String(accountId);
    users.has(id) ? users.delete(id) : users.add(id);
    patch('userAccountIds', [...users]);
  };

  const save = async () => {
    setBusy(true);
    try {
      const saved = await invoke('portal-admin:save', {
        reportId: selected.id,
        config: selected.config
      });
      setSelected(report => ({ ...report, config: saved }));
      setMessage('Portal delivery settings saved.');
      await load();
    } catch (error) {
      setMessage(error?.message || 'Could not save portal delivery settings.');
    } finally {
      setBusy(false);
    }
  };

  const searchCustomers = async () => {
    if (!cfg.serviceDeskId) {
      setMessage('Choose a service project first.');
      return;
    }
    if (!customerQuery.trim()) {
      setMessage('Enter a customer name or email address.');
      return;
    }

    setBusy(true);
    try {
      const results = await invoke('portal-admin:customers', {
        serviceDeskId: cfg.serviceDeskId,
        query: customerQuery
      }) || [];
      setCustomerResults(results);
      setKnownUsers(existing => ({
        ...existing,
        ...Object.fromEntries(results.filter(user => user.accountId).map(user => [String(user.accountId), user]))
      }));
      setMessage(results.length
        ? `${results.length} matching portal customer${results.length === 1 ? '' : 's'} found.`
        : 'No matching portal customers found.');
    } catch (error) {
      setMessage(error?.message || 'Could not search portal customers.');
    } finally {
      setBusy(false);
    }
  };

  const publish = async () => {
    setBusy(true);
    setMessage(`Generating and publishing ${selected.name}…`);
    let jobId;

    try {
      const saved = await invoke('portal-admin:save', {
        reportId: selected.id,
        config: selected.config
      });
      setSelected(report => ({ ...report, config: saved }));

      const started = await invoke('portal-admin:publish', { reportId: selected.id });
      jobId = started.jobId;

      for (let i = 0; i < 300; i += 1) {
        const status = await invoke('portal-admin:job-status', { jobId });
        if (status?.state === 'ready' || status?.state === 'ready-with-errors') {
          const details = (status.deliveries || [])
            .filter(item => item.ok && item.issueKey)
            .map(item => item.issueKey)
            .join(', ');
          setMessage(
            `Published ${status.filename || 'Excel report'} to ${status.delivered || 0} customer${status.delivered === 1 ? '' : 's'}` +
            (details ? ` via ${details}` : '') +
            (status.failed ? `. ${status.failed} delivery failed.` : '.')
          );
          return;
        }
        if (status?.state === 'failed') throw new Error(status.message || 'Portal publishing failed.');
        await sleep(2000);
      }
      throw new Error('The report is still generating. Check again shortly.');
    } catch (error) {
      setMessage(error?.message || 'Could not publish the report.');
    } finally {
      if (jobId) await invoke('portal-admin:job-cleanup', { jobId }).catch(() => {});
      setBusy(false);
    }
  };

  if (selected) {
    return <main>
      <header>
        <div>
          <button className="link" onClick={() => setSelected(null)}>← Portal reports</button>
          <div className="eyebrow">JSM delivery</div>
          <h1>{selected.name}</h1>
          <p>{selected.description || 'Publish this saved Excel report to selected Jira Service Management customers.'}</p>
        </div>
        <div className="actions">
          <button disabled={busy} onClick={publish}>Generate & publish now</button>
          <button className="primary" disabled={busy} onClick={save}>Save settings</button>
        </div>
      </header>

      {message && <div className="notice">{message}</div>}

      <section className="panel">
        <label className="check">
          <input
            type="checkbox"
            checked={cfg.enabled === true}
            onChange={event => patch('enabled', event.target.checked)}
          />
          Enable portal delivery for this report
        </label>

        <h2>Service project</h2>
        <p className="help">The app creates customer-visible JSM report requests in this service project and attaches the generated XLSX file.</p>
        <label>
          Service project
          <select
            value={cfg.serviceDeskId || ''}
            onChange={event => {
              patch('serviceDeskId', event.target.value);
              setCustomerResults([]);
              setCustomerQuery('');
            }}
          >
            <option value="">Choose a service project</option>
            {serviceDesks.map(desk =>
              <option key={desk.id} value={String(desk.id)}>{desk.projectName || desk.name || `Service project ${desk.id}`}</option>
            )}
          </select>
        </label>

        <h2>Portal customers</h2>
        <p className="help">Only customers you add here receive the published workbook. They access it through their normal JSM Requests area, so no app consent prompt is required.</p>

        {!!selectedUsers.length && <div className="chips">
          {selectedUsers.map(id => {
            const user = knownUsers[id];
            return <span key={id}>
              {user?.displayName || user?.emailAddress || 'Selected portal customer'}
              <button onClick={() => toggleUser(id)}>×</button>
            </span>;
          })}
        </div>}

        <div className="searchRow">
          <input
            value={customerQuery}
            onChange={event => setCustomerQuery(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter') {
                event.preventDefault();
                searchCustomers();
              }
            }}
            placeholder="Search portal customer by name or email"
          />
          <button disabled={busy || !cfg.serviceDeskId} onClick={searchCustomers}>Search</button>
        </div>

        {!!customerResults.length && <div className="results">
          {customerResults.map(user => {
            const id = String(user.accountId);
            const added = selectedUsers.includes(id);
            const secondary = user.emailAddress || 'Portal customer';
            return <div key={id}>
              <div>
                <strong>{user.displayName || 'Portal customer'}</strong>
                <small>{secondary}</small>
              </div>
              <button disabled={added} onClick={() => {
                setKnownUsers(existing => ({ ...existing, [id]: user }));
                toggleUser(id);
              }}>{added ? 'Added' : 'Add'}</button>
            </div>;
          })}
        </div>}

        <div className="info">
          The report is generated by Forge using the app's Jira permissions, so the workbook can include data the customer cannot browse directly. Only the finished XLSX is deliberately published to the selected JSM customer request.
        </div>
      </section>
    </main>;
  }

  return <main>
    <header>
      <div>
        <div className="eyebrow">Nuvriqo</div>
        <h1>Portal Reports</h1>
        <p>Publish saved Excel reports to Jira Service Management customers while keeping the entire delivery flow inside Atlassian.</p>
      </div>
    </header>

    {message && <div className="notice">{message}</div>}

    <section className="panel">
      <div className="info">
        Portal delivery uses customer-visible JSM requests and public XLSX attachments. Customers open the report from their normal Requests area, so they are not asked to grant the app access to Atlassian products.
      </div>
    </section>

    <section className="panel">
      {!reports.length
        ? <p>No saved reports found.</p>
        : reports.map(report =>
          <article className="report" key={report.id}>
            <div>
              <div className="title">
                <strong>{report.name}</strong>
                <span className={report.config?.enabled ? 'pill on' : 'pill'}>
                  {report.config?.enabled ? 'Portal delivery enabled' : 'Not enabled'}
                </span>
              </div>
              <p>{report.description || 'Saved Excel report'}</p>
              <small>
                {report.config?.serviceDeskId
                  ? `Service project ${report.config.serviceDeskId} · ${(report.config.userAccountIds || []).length} selected customer${(report.config.userAccountIds || []).length === 1 ? '' : 's'}`
                  : 'No portal delivery target configured yet.'}
              </small>
            </div>
            <button onClick={() => setSelected(report)}>Configure</button>
          </article>
        )}
    </section>
  </main>;
}

createRoot(document.getElementById('root')).render(<App />);
