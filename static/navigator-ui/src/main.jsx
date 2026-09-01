import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { invoke, view } from '@forge/bridge';
import './styles.css';

const downloadBase64 = (base64, filename) => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename || 'jira-search.xlsx';
  anchor.click();
  URL.revokeObjectURL(url);
};

function App() {
  const [context, setContext] = useState(null);
  const [reports, setReports] = useState([]);
  const [templateId, setTemplateId] = useState('');
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    Promise.all([view.getContext(), invoke('report:list')])
      .then(([ctx, list]) => {
        setContext(ctx);
        setReports(list || []);
        if (list?.length) setTemplateId(list[0].id);
      })
      .catch(error => setMessage(error.message || 'Could not load Excel Report Manager.'))
      .finally(() => setBusy(false));
  }, []);

  const extension = context?.extension || {};
  const selectedKeys = useMemo(() => {
    const raw = extension.issueKeys;
    if (Array.isArray(raw)) return raw.filter(Boolean);
    return String(raw || '').split(/[\s,]+/).filter(Boolean);
  }, [extension.issueKeys]);
  const usingSelection = selectedKeys.length > 0;

  const runExport = async () => {
    if (!templateId) return;
    setBusy(true);
    setMessage('Generating Excel workbook…');
    try {
      const template = reports.find(report => report.id === templateId);
      const result = await invoke('report:navigator-export', {
        id: templateId,
        jql: extension.jql || '',
        filterId: extension.filterId || null,
        issueKeys: extension.issueKeys || []
      });
      downloadBase64(result.workbookBase64, `${template?.name || 'Jira search'}.xlsx`);
      setMessage(`Exported ${result.entry.issueCount} work item${result.entry.issueCount === 1 ? '' : 's'}.`);
    } catch (error) {
      setMessage(error.message || 'The export failed.');
    } finally {
      setBusy(false);
    }
  };

  return <main>
    <div className="eyebrow">Nuvriqo</div>
    <h1>Export with Excel Report Manager</h1>
    <p className="lead">Use one of your saved Excel designs with the work items from this Jira search.</p>

    {message && <div className="notice">{message}</div>}

    <section className="panel">
      <h2>What will be exported?</h2>
      <div className="source">
        <strong>{usingSelection ? `${selectedKeys.length} selected work item${selectedKeys.length === 1 ? '' : 's'}` : 'Current search results'}</strong>
        <span>{usingSelection ? selectedKeys.slice(0, 8).join(', ') + (selectedKeys.length > 8 ? '…' : '') : (extension.jql || 'Jira search query')}</span>
      </div>
    </section>

    <section className="panel">
      <h2>Choose Excel template</h2>
      {!reports.length && !busy ? <div className="empty">
        <strong>No saved templates yet</strong>
        <p>Create a report in Excel Report Manager first. Its columns and workbook styling will then appear here as an export template.</p>
      </div> : <>
        <label>Saved template
          <select value={templateId} onChange={event => setTemplateId(event.target.value)} disabled={busy}>
            {reports.map(report => <option key={report.id} value={report.id}>{report.name}</option>)}
          </select>
        </label>
        {templateId && <div className="templateSummary">
          {(() => {
            const report = reports.find(item => item.id === templateId);
            return <>
              <span><strong>{report?.template?.columns?.length || 0}</strong> columns</span>
              <span><strong>{report?.template?.workbook?.sheetName || 'Issues'}</strong> worksheet</span>
              <span>Saved colours, fonts and widths applied</span>
            </>;
          })()}
        </div>}
      </>}
    </section>

    <div className="actions">
      <button onClick={() => view.close()} disabled={busy}>Cancel</button>
      <button className="primary" onClick={runExport} disabled={busy || !templateId}>{busy ? 'Working…' : 'Download Excel'}</button>
    </div>
    <p className="hint">Selected work items take priority. If nothing is selected, Excel Report Manager uses the current Jira search, up to 5,000 work items.</p>
  </main>;
}

createRoot(document.getElementById('root')).render(<App />);
