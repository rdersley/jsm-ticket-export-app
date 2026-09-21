import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { objectStore } from '@forge/bridge';
import './styles.css';

const KEY = 'portal-poc/latest-report.xlsx';

function App() {
  const [state, setState] = useState('idle');
  const [message, setMessage] = useState('');

  const download = async () => {
    setState('busy');
    setMessage('Preparing download…');
    try {
      const results = await objectStore.download({
        functionKey: 'object-download',
        keys: [KEY]
      });
      const result = results?.[0];
      if (!result?.success || !result?.blob) {
        throw new Error(result?.error || 'Object Store did not return the report file.');
      }

      const url = URL.createObjectURL(result.blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'Object Store Portal Test.xlsx';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setState('done');
      setMessage('Download started successfully.');
    } catch (error) {
      setState('error');
      setMessage(error?.message || String(error));
    }
  };

  return (
    <main>
      <div className="eyebrow">OBJECT STORE TEST</div>
      <h2>Portal Report</h2>
      <p>This report is stored in Forge Object Store. No JSM ticket is used.</p>
      <div className="card">
        <div>
          <strong>Object Store Portal Test</strong>
          <span>Backend-generated Excel workbook</span>
        </div>
        <button disabled={state === 'busy'} onClick={download}>
          {state === 'busy' ? 'Preparing…' : 'Download Excel'}
        </button>
      </div>
      {message && <p className={state === 'error' ? 'error' : 'message'}>{message}</p>}
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
