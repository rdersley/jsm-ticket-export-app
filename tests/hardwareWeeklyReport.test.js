import test from 'node:test';
import assert from 'node:assert/strict';
import {
  nextDay,
  linkedIssueKeys,
  isEscalatedToProject,
  receivedTransitionDate
} from '../src/services/hardwareWeeklyReport.js';

test('nextDay advances a Jira report date safely', () => {
  assert.equal(nextDay('2026-09-13'), '2026-09-14');
  assert.equal(nextDay('2026-12-31'), '2027-01-01');
});

test('linkedIssueKeys reads inward and outward Jira links', () => {
  const issue = {
    fields: {
      issuelinks: [
        { outwardIssue: { key: 'HW-123' } },
        { inwardIssue: { key: 'SD-456' } },
        { outwardIssue: { key: 'HW-123' } }
      ]
    }
  };
  assert.deepEqual(linkedIssueKeys(issue), ['HW-123', 'SD-456']);
  assert.equal(isEscalatedToProject(issue, 'HW'), true);
  assert.equal(isEscalatedToProject(issue, 'ABC'), false);
});

test('receivedTransitionDate honours configured received statuses', () => {
  const histories = [
    {
      created: '2026-09-10T09:15:00.000+0000',
      items: [{ field: 'status', fromString: 'Waiting Return', toString: 'Device Received' }]
    },
    {
      created: '2026-09-11T11:00:00.000+0000',
      items: [{ field: 'status', fromString: 'Device Received', toString: 'Closed' }]
    }
  ];
  const result = receivedTransitionDate(histories, ['Device Received']);
  assert.equal(result.toISOString(), '2026-09-10T09:15:00.000Z');
});

test('receivedTransitionDate can auto-detect a received/back status as a fallback', () => {
  const histories = [{
    created: '2026-09-12T12:00:00.000+0000',
    items: [{ field: 'status', toString: 'Returned from Crew' }]
  }];
  assert.equal(receivedTransitionDate(histories)?.toISOString(), '2026-09-12T12:00:00.000Z');
});
