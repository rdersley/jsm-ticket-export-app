import React from 'react';
import ForgeReconciler, { Heading, Stack, Text } from '@forge/react';

const PortalReports = () => (
  <Stack space="space.100">
    <Heading size="small">Reports</Heading>
    <Text>Portal Reports are temporarily in read-only mode while secure customer report delivery is being finalised.</Text>
  </Stack>
);

ForgeReconciler.render(<PortalReports />);
