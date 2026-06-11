/** @type {import('next').NextConfig} */
const nextConfig = {
  // exceljs ships a CommonJS build that Next's server bundler should treat as external.
  serverExternalPackages: ["exceljs"],
};

export default nextConfig;
