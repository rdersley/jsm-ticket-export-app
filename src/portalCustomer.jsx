import React from 'react';
import ForgeReconciler, { Heading, Link, Stack, Text } from '@forge/react';

const App = () => (
  <Stack space="space.200">
    <Heading size="small">Reports</Heading>
    <Text>
      Excel reports published for you are delivered through Jira Service Management requests.
      Open your Requests area to view and download the latest published files.
    </Text>
    <Link href="/servicedesk/customer/user/requests">View my requests</Link>
  </Stack>
);

ForgeReconciler.render(<App />);
