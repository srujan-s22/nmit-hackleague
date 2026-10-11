import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        surface: {
          light: "#F5F6F4",
          border: "#E6E9E5",
        },
        institutional: {
          green: "#E3F1E6",
          red: "#F8E8E6",
          charcoal: "#252825",
        },
      },
    },
  },
  plugins: [],
};

export default config;
