import React, { useEffect, useState } from 'react';
import ForgeReconciler, { Button, DatePicker, Heading, Inline, Label, Lozenge, Select, Spinner, Stack, Text } from '@forge/react';
import { invoke, router } from '@forge/bridge';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const NO_DATE_FILTER = { label: 'All dates', value: '' };

// Turns a card's picker state into the filters the backend expects, or null.
const selectionFrom = state => {
  const date = state?.field ? {
    field: state.field,
    preset: state.preset || 'last30',
    from: state.from || null,
    to: state.to || null
  } : null;
  const choices = Object.fromEntries(Object.entries(state?.choices || {}).filter(([, ids]) => ids?.length));
  return date || Object.keys(choices).length ? { date, choices } : null;
};

const hasFilters = options => Boolean(options?.dateFields?.length || options?.choices?.length);

// Shows only the filters the report creator allowed for this report.
const FilterControls = ({ reportId, options, state, onChange }) => {
  const dateOptions = [NO_DATE_FILTER, ...(options.dateFields || []).map(f => ({ label: f.label, value: f.id }))];
  const presetOptions = (options.presets || []).map(p => ({ label: p.label, value: p.id }));
  const field = dateOptions.find(o => o.value === (state?.field || '')) || NO_DATE_FILTER;
  const preset = presetOptions.find(o => o.value === (state?.preset || 'last30')) || presetOptions[0];
  const update = changes => onChange({ ...(state || {}), ...changes });
  const setChoice = (fieldId, ids) => update({ choices: { ...(state?.choices || {}), [fieldId]: ids } });

  return (
    <Inline space="space.200" shouldWrap alignBlock="end">
      {options.dateFields?.length ? (
        <Stack space="space.050">
          <Label labelFor={`date-field-${reportId}`}>Filter by date</Label>
          <Select inputId={`date-field-${reportId}`} options={dateOptions} value={field} onChange={o => update({ field: o?.value || '' })} />
        </Stack>
      ) : null}
      {field.value ? (
        <Stack space="space.050">
          <Label labelFor={`date-range-${reportId}`}>Date range</Label>
          <Select inputId={`date-range-${reportId}`} options={presetOptions} value={preset} onChange={o => update({ preset: o?.value || 'last30' })} />
        </Stack>
      ) : null}
      {field.value && preset?.value === 'custom' ? (
        <>
          <Stack space="space.050">
            <Label labelFor={`date-from-${reportId}`}>From</Label>
            <DatePicker id={`date-from-${reportId}`} value={state?.from || ''} onChange={value => update({ from: value || '' })} />
          </Stack>
          <Stack space="space.050">
            <Label labelFor={`date-to-${reportId}`}>To</Label>
            <DatePicker id={`date-to-${reportId}`} value={state?.to || ''} onChange={value => update({ to: value || '' })} />
          </Stack>
        </>
      ) : null}
      {(options.choices || []).map(choice => {
        const values = choice.values.map(v => ({ label: v.label, value: v.id }));
        const picked = state?.choices?.[choice.id] || [];
        return (
          <Stack key={choice.id} space="space.050">
            <Label labelFor={`choice-${reportId}-${choice.id}`}>{choice.label}</Label>
            <Select
              inputId={`choice-${reportId}-${choice.id}`}
              isMulti
              placeholder="Any"
              options={values}
              value={values.filter(v => picked.includes(v.value))}
              onChange={selected => setChoice(choice.id, (selected || []).map(o => o.value))}
            />
          </Stack>
        );
      })}
    </Inline>
  );
};

const PortalReports = () => {
  const [reports, setReports] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [filters, setFilters] = useState({});

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
    const selection = selectionFrom(filters[report.id]);
    setBusy(report.id);
    setError('');
    setMessage(`Generating ${report.name}…`);
    let jobId = '';
    try {
      const started = await invoke('portal:run', { reportId: report.id, filters: selection });
      jobId = started?.jobId || '';
      if (!jobId) throw new Error('The report could not be queued.');

      for (let attempt = 0; attempt < 450; attempt += 1) {
        const status = await invoke('portal:job-status', { jobId });
        if (status?.state === 'ready' && selection) {
          // Filtered copies are private to this customer; the job is kept
          // until their next filtered run so the download page can read it.
          const count = status.issueCount != null ? ` · ${status.issueCount} work items` : '';
          setMessage(`${report.name} is ready${count}. Starting download…`);
          const { downloadUrl } = await invoke('portal:job-download', { jobId });
          if (!downloadUrl) throw new Error('The download link could not be created.');
          await router.open(downloadUrl);
          jobId = '';
          return;
        }
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

          {report.allowRun && hasFilters(report.filters) ? (
            <FilterControls
              reportId={report.id}
              options={report.filters}
              state={filters[report.id]}
              onChange={next => setFilters(current => ({ ...current, [report.id]: next }))}
            />
          ) : null}

          {report.allowRun ? (
            <Inline space="space.100">
              <Button appearance="primary" isDisabled={busy === report.id} onClick={() => run(report)}>
                {busy === report.id ? 'Generating…' : selectionFrom(filters[report.id]) ? 'Generate filtered report' : 'Generate fresh report'}
              </Button>
            </Inline>
          ) : null}
        </Stack>
      ))}
    </Stack>
  );
};

ForgeReconciler.render(<PortalReports />);
