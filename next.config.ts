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
  // The separate log pages were merged into tabs on /logs; weight now lives
  // on the Body tab.
  async redirects() {
    return [
      ['food', 'food'],
      ['exercise', 'exercise'],
      ['weight', 'body'],
    ].map(([page, tab]) => ({
      source: `/${page}`,
      destination: `/logs?tab=${tab}`,
      permanent: false,
    }));
  },
};

export default nextConfig;
