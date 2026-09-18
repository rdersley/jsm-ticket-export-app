import React from 'react';
import ForgeReconciler, { Heading, Stack, Text } from '@forge/react';

const PortalReports = () => (
  <Stack space="space.100">
    <Heading size="small">Reports</Heading>
    <Text>Portal Reports is available without requesting access. Dynamic report delivery is being enabled separately.</Text>
  </Stack>
);

ForgeReconciler.render(<PortalReports />);
