import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

/**
 * Bookmap tokens. A cloth-bound book read at night: aubergine "cloth" grounds,
 * lilac-white "paper" for text, and one magenta "ribbon" (the bookmark) for
 * primary actions. Outcome and Bloom colors are reserved for the map.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: "#1B1026", raised: "#251933", sunk: "#140B1C" },
        line: { DEFAULT: "#3B2C49", strong: "#594670" },
        paper: "#F6EFF3",
        mute: "#B5A6C1",
        ribbon: { DEFAULT: "#F0579B", deep: "#B8326F", soft: "#F8A9CB" },
        danger: "#FF8FA3",
        bloom: {
          remember: "#6FD6C4",
          understand: "#7FB4F5",
          apply: "#A99CF7",
          analyze: "#D58AF0",
          evaluate: "#F35FB6",
          create: "#FF6B6B",
        },
        outcome: { mastered: "#5EE3A1", attempted: "#F5B94C", untested: "#6B5A7B" },
      },
      fontFamily: {
        serif: ['"Literata Variable"', "Georgia", "ui-serif", "serif"],
        sans: ['"Atkinson Hyperlegible Next Variable"', "ui-sans-serif", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [animate],
};

export default config;
