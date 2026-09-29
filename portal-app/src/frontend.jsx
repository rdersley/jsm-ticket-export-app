import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  Box, Button, DatePicker, EmptyState, Heading, Inline, Label, Lozenge, SectionMessage, Select, Spinner, Stack, Text, xcss
} from '@forge/react';
import { invoke, router } from '@forge/bridge';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const NO_DATE_FILTER = { label: 'All dates', value: '' };

// Nuvriqo UI Kit card and inner panel (tokens only, so dark mode works).
const cardStyle = xcss({
  backgroundColor: 'elevation.surface.raised',
  boxShadow: 'elevation.shadow.raised',
  borderRadius: 'border.radius.200',
  padding: 'space.200'
});
const panelStyle = xcss({
  backgroundColor: 'elevation.surface.sunken',
  borderRadius: 'border.radius.100',
  padding: 'space.150'
});

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

// Downloads open the app's download page, which Jira confirms in a popup.
const POPUP_HINT = 'Click Continue in the Atlassian popup to start the download.';
const count = n => (n != null ? Number(n).toLocaleString() : null);
const workItems = n => (n != null ? ` · ${count(n)} work items` : '');
const when = iso => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const elapsed = ms => {
  const seconds = Math.max(0, Math.round(ms / 1000));
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`;
};
const progressMessage = (state, ms) => {
  if (state === 'queued') return `Waiting to start… (${elapsed(ms)})`;
  const hint = ms > 20000 ? ' Large reports can take a few minutes. Keep this page open.' : '';
  return `Building your report… ${elapsed(ms)} so far.${hint}`;
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
          <Label labelFor={`date-field-${reportId}`}>Date</Label>
          <Select inputId={`date-field-${reportId}`} options={dateOptions} value={field} onChange={o => update({ field: o?.value || '' })} />
        </Stack>
      ) : null}
      {field.value ? (
        <Stack space="space.050">
          <Label labelFor={`date-range-${reportId}`}>Range</Label>
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

// Per-report feedback: a spinner while working, SectionMessage otherwise.
const ReportStatus = ({ status }) => {
  if (!status) return null;
  if (status.kind === 'progress') {
    return (
      <Inline space="space.100" alignBlock="center">
        <Spinner size="small" />
        <Text color="color.text.subtle">{status.text}</Text>
      </Inline>
    );
  }
  const appearance = status.kind === 'error' ? 'error' : status.kind === 'success' ? 'success' : 'information';
  return (
    <SectionMessage appearance={appearance} title={status.title}>
      <Text>{status.text}</Text>
    </SectionMessage>
  );
};

const ReportCard = ({ report, busy, status, filterState, onFilterChange, onDownload, onDownloadFiltered, hasFilteredCopy, onGenerate, onClearFilters }) => {
  const selection = selectionFrom(filterState);
  const canDownload = report.allowDownload && report.latest && report.downloadUrl;
  const published = report.latest
    ? `Published ${when(report.latest.generatedAt)}${workItems(report.latest.issueCount)}`
    : 'No published copy yet.';

  return (
    <Box xcss={cardStyle}>
      <Stack space="space.150">
        <Inline spread="space-between" alignBlock="start" space="space.100">
          <Stack space="space.050">
            <Heading size="small">{report.name}</Heading>
            {report.description ? <Text color="color.text.subtle">{report.description}</Text> : null}
          </Stack>
          {report.latest ? <Lozenge appearance="success">Published</Lozenge> : <Lozenge>Not published</Lozenge>}
        </Inline>

        <Text size="small" color="color.text.subtlest">{published}</Text>

        {canDownload || hasFilteredCopy ? (
          <Inline space="space.100" shouldWrap>
            {canDownload ? <Button appearance="primary" onClick={onDownload}>Download Excel</Button> : null}
            {hasFilteredCopy && !busy ? <Button onClick={onDownloadFiltered}>Download filtered copy</Button> : null}
          </Inline>
        ) : null}

        <ReportStatus status={status} />

        {report.allowRun ? (
          <Box xcss={panelStyle}>
            <Stack space="space.150">
              <Stack space="space.050">
                <Text weight="bold">Generate a fresh copy</Text>
                <Text size="small" color="color.text.subtle">
                  {hasFilters(report.filters)
                    ? 'Optionally narrow it down first. A filtered copy is just for you and does not replace the published one.'
                    : 'Builds the report again with the latest data.'}
                </Text>
              </Stack>
              {hasFilters(report.filters) ? (
                <FilterControls reportId={report.id} options={report.filters} state={filterState} onChange={onFilterChange} />
              ) : null}
              <Inline space="space.100" alignBlock="center">
                <Button appearance={canDownload ? 'default' : 'primary'} isDisabled={busy} onClick={onGenerate}>
                  {busy ? 'Generating…' : selection ? 'Generate filtered report' : 'Generate fresh report'}
                </Button>
                {selection && !busy ? <Button appearance="subtle" onClick={onClearFilters}>Clear filters</Button> : null}
              </Inline>
            </Stack>
          </Box>
        ) : null}
      </Stack>
    </Box>
  );
};

const PortalReports = () => {
  const [reports, setReports] = useState(null);
  const [listError, setListError] = useState('');
  const [busy, setBusy] = useState('');
  const [statuses, setStatuses] = useState({});
  const [filters, setFilters] = useState({});
  // Latest private (filtered) copy per report, so it can be downloaded again.
  const [filteredJobs, setFilteredJobs] = useState({});

  const setStatus = (reportId, status) => setStatuses(current => ({ ...current, [reportId]: status }));

  const refresh = async () => {
    setListError('');
    try {
      const items = await invoke('portal:list', {});
      setReports(Array.isArray(items) ? items : []);
    } catch (e) {
      setReports([]);
      setListError(e?.message || String(e));
    }
  };

  useEffect(() => { refresh(); }, []);

  const openDownload = async (report, url) => {
    setStatus(report.id, { kind: 'info', title: 'Opening download', text: POPUP_HINT });
    await router.open(url);
  };

  // Signed links expire after 10 minutes, so each click asks for a fresh one.
  const downloadPublished = async report => {
    try {
      const { downloadUrl } = await invoke('portal:published-download', { reportId: report.id });
      if (!downloadUrl) throw new Error('The download link could not be created.');
      await openDownload(report, downloadUrl);
    } catch (e) {
      setStatus(report.id, { kind: 'error', title: 'Download unavailable', text: e?.message || 'The published copy could not be downloaded. Please refresh the page and try again.' });
    }
  };

  const downloadFiltered = async report => {
    try {
      const { downloadUrl } = await invoke('portal:job-download', { jobId: filteredJobs[report.id] });
      if (!downloadUrl) throw new Error('The download link could not be created.');
      await openDownload(report, downloadUrl);
    } catch (e) {
      setStatus(report.id, { kind: 'error', title: 'Download unavailable', text: e?.message || 'This filtered copy is no longer available. Please generate it again.' });
      setFilteredJobs(current => ({ ...current, [report.id]: '' }));
    }
  };

  const run = async report => {
    const selection = selectionFrom(filters[report.id]);
    const started = Date.now();
    setBusy(report.id);
    setStatus(report.id, { kind: 'progress', text: progressMessage('queued', 0) });
    let jobId = '';
    try {
      const queued = await invoke('portal:run', { reportId: report.id, filters: selection });
      jobId = queued?.jobId || '';
      if (!jobId) throw new Error('The report could not be queued.');

      for (let attempt = 0; attempt < 450; attempt += 1) {
        const status = await invoke('portal:job-status', { jobId });
        if (status?.state === 'ready' && selection) {
          // Filtered copies are private to this customer; the job is kept
          // until their next filtered run so the download page can read it.
          const readyJobId = jobId;
          jobId = '';
          setFilteredJobs(current => ({ ...current, [report.id]: readyJobId }));
          const { downloadUrl } = await invoke('portal:job-download', { jobId: readyJobId });
          if (!downloadUrl) throw new Error('The download link could not be created.');
          setBusy('');
          setStatus(report.id, { kind: 'success', title: `Ready${workItems(status.issueCount)}`, text: POPUP_HINT });
          await router.open(downloadUrl);
          return;
        }
        if (status?.state === 'ready') {
          await invoke('portal:job-cleanup', { jobId }).catch(() => {});
          const items = await invoke('portal:list', {}).catch(() => []);
          setReports(Array.isArray(items) ? items : []);
          const fresh = Array.isArray(items) ? items.find(item => item.id === report.id) : null;
          setBusy('');
          if (fresh?.downloadUrl) {
            setStatus(report.id, { kind: 'success', title: `Ready${workItems(status.issueCount)}`, text: POPUP_HINT });
            await router.open(fresh.downloadUrl);
          } else {
            setStatus(report.id, { kind: 'success', title: `Ready${workItems(status.issueCount)}`, text: 'The published copy has been updated.' });
          }
          return;
        }
        if (status?.state === 'failed') throw new Error(status.message || 'Report generation failed.');
        if (status?.state === 'missing') throw new Error('The report job could not be found.');
        setStatus(report.id, { kind: 'progress', text: progressMessage(status?.state, Date.now() - started) });
        await wait(2000);
      }
      throw new Error(`Still generating after ${elapsed(Date.now() - started)}. Try again later, or add a date filter to make the report smaller.`);
    } catch (e) {
      setStatus(report.id, { kind: 'error', title: 'The report could not be generated', text: e?.message || String(e) });
      if (jobId) await invoke('portal:job-cleanup', { jobId }).catch(() => {});
    } finally {
      setBusy('');
    }
  };

  return (
    <Stack space="space.200">
      <Stack space="space.050">
        <Heading size="medium">Reports</Heading>
        <Text color="color.text.subtle">Download the latest published copy, or generate a fresh one filtered to what you need.</Text>
      </Stack>

      {listError ? <SectionMessage appearance="error" title="Reports could not be loaded"><Text>{listError}</Text></SectionMessage> : null}
      {reports === null ? (
        <Inline space="space.100" alignBlock="center"><Spinner size="medium" /><Text>Loading your reports…</Text></Inline>
      ) : null}
      {reports !== null && reports.length === 0 && !listError ? (
        <EmptyState header="No reports yet" description="Reports shared with you by the service desk will appear here." />
      ) : null}

      {reports?.map(report => (
        <ReportCard
          key={report.id}
          report={report}
          busy={busy === report.id}
          status={statuses[report.id]}
          filterState={filters[report.id]}
          onFilterChange={next => setFilters(current => ({ ...current, [report.id]: next }))}
          onClearFilters={() => setFilters(current => ({ ...current, [report.id]: {} }))}
          hasFilteredCopy={Boolean(filteredJobs[report.id])}
          onDownload={() => downloadPublished(report)}
          onDownloadFiltered={() => downloadFiltered(report)}
          onGenerate={() => run(report)}
        />
      ))}
    </Stack>
  );
};

ForgeReconciler.render(<PortalReports />);
