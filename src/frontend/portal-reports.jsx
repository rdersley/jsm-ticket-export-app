import React from 'react';
import ForgeReconciler, { Heading, Stack, Text } from '@forge/react';

const PortalReports = () => (
  <Stack space="space.100">
    <Heading size="small">Reports</Heading>
    <Text>Portal Reports loaded without requesting customer access.</Text>
  </Stack>
);

ForgeReconciler.render(<PortalReports />);
