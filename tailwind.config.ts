import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          t: "#18C7C1",
          ink: "#111111",
          soft: "#F1FDFC",
          line: "#E6F2F1",
        },
      },
    },
  },
  plugins: [],
};

export default config;

