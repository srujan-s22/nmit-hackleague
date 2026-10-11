import nextConfig from "eslint-config-next/core-web-vitals";

const config = [
  {
    ignores: [
      ".next/**",
      "out/**",
      "build/**",
      "node_modules/**",
      "next-env.d.ts",
      "npm-audit-report.json",
      "npm-audit-stderr.log",
    ],
  },
  ...nextConfig,
];

export default config;
