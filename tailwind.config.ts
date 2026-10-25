import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  // Colors are defined once, in src/app/globals.css's `@theme` block (Tailwind
  // v4 CSS-first config) — that is the single source of truth. This file no
  // longer duplicates a second, drifted copy of the same token names (e.g. a
  // stale institutional.charcoal here previously disagreed with globals.css's
  // --color-institutional-charcoal). Confirmed no component references a
  // utility class that only this block generated.
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;
