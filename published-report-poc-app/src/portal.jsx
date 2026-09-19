import React, { useEffect, useState } from 'react';
import ForgeReconciler, { Button, Heading, LinkButton, Lozenge, Spinner, Stack, Text } from '@forge/react';
import { requestJira } from '@forge/bridge';

function summaryOf(request) {
  const values = Array.isArray(request?.requestFieldValues) ? request.requestFieldValues : [];
  const summary = values.find(v => v.fieldId === 'summary');
  return String(summary?.value || request?.summary || '');
}

const Portal = () => {
  const [reports, setReports] = useState(null);
  const [error, setError] = useState('');

  const load = async () => {
    setReports(null);
    setError('');
    try {
      const response = await requestJira('/rest/servicedeskapi/request?requestOwnership=OWNED_REQUESTS&start=0&limit=100');
      if (!response.ok) throw new Error(`Could not list your JSM requests (${response.status}).`);
      const body = await response.json();
      const candidates = (body.values || []).filter(r => summaryOf(r).startsWith('[Nuvriqo Report POC]'));

      const enriched = [];
      for (const request of candidates) {
        const issueKey = request.issueKey || request.issueId;
        const attachmentResponse = await requestJira(`/rest/servicedeskapi/request/${encodeURIComponent(issueKey)}/attachment?start=0&limit=50`);
        const attachmentBody = attachmentResponse.ok ? await attachmentResponse.json() : { values: [] };
        const attachments = (attachmentBody.values || []).filter(a => String(a.filename || '').toLowerCase().endsWith('.xlsx'));
        enriched.push({ issueKey, summary: summaryOf(request), attachments });
      }
      setReports(enriched);
    } catch (e) {
      setReports([]);
      setError(e?.message || String(e));
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <Stack space="space.200">
      <Heading size="small">Published Report POC</Heading>
      <Text>This section has no resolver. It only reads customer-visible JSM requests and their public attachments.</Text>
      <Button onClick={load}>Refresh published reports</Button>
      {error ? <Text>{error}</Text> : null}
      {reports === null ? <Spinner /> : null}
      {reports?.length === 0 ? <Text>No published POC reports are visible to this portal customer yet.</Text> : null}
      {reports?.map(report => (
        <Stack key={report.issueKey} space="space.100">
          <Lozenge appearance="success">Published</Lozenge>
          <Text>{report.summary}</Text>
          <Text>Request: {report.issueKey}</Text>
          {report.attachments.map(att => (
            <LinkButton key={att.filename} appearance="primary" href={att?._links?.content} target="_blank">
              Download {att.filename}
            </LinkButton>
          ))}
        </Stack>
      ))}
    </Stack>
  );
};

ForgeReconciler.render(<Portal />);
