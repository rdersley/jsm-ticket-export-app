import React from 'react';
import ForgeReconciler, { Heading, Stack, Text } from '@forge/react';

const PortalReports = () => (
  <Stack space="space.100">
    <Heading size="small">Reports</Heading>
    <Text>Portal Reports are available without requesting access to your Atlassian account.</Text>
  </Stack>
);

ForgeReconciler.render(<PortalReports />);
