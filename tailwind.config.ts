import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // The "flag" yellow used for likely false positives, matching the
        // spreadsheet fill from the original manual workflow.
        flag: {
          DEFAULT: "#FFF3B0",
          border: "#E6C200",
        },
      },
    },
  },
  plugins: [],
};

export default config;
