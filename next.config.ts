import type {NextConfig} from 'next';
import {networkInterfaces} from 'node:os';

// Allow this machine's current LAN IPs so other devices can reach `next dev`.
const lanAddresses = Object.values(networkInterfaces())
  .flat()
  .filter((iface) => iface?.family === 'IPv4' && !iface.internal)
  .map((iface) => iface!.address);

const nextConfig: NextConfig = {
  output: 'standalone',
  allowedDevOrigins: lanAddresses,
  // The separate log pages were merged into tabs on /logs.
  async redirects() {
    return ['food', 'exercise', 'weight'].map((tab) => ({
      source: `/${tab}`,
      destination: `/logs?tab=${tab}`,
      permanent: false,
    }));
  },
};

export default nextConfig;
