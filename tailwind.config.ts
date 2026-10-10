import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: "#150D1C", raised: "#1F1529", sunk: "#100916" },
        line: { DEFAULT: "#3B2D49", strong: "#5A4769" },
        paper: "#F4EDF8",
        mute: "#AE9FBB",
        magenta: { DEFAULT: "#F0389E", deep: "#B4237A", soft: "#F7A3D0" },
        bloom: {
          remember: "#6FD6C4",
          understand: "#7FB4F5",
          apply: "#A99CF7",
          analyze: "#D58AF0",
          evaluate: "#F35FB6",
          create: "#FF6B6B",
        },
        outcome: { mastered: "#5EE3A1", attempted: "#F5B94C", untested: "#5C4E68" },
      },
      fontFamily: {
        display: ['"Bricolage Grotesque Variable"', "ui-sans-serif", "system-ui", "sans-serif"],
        sans: ['"Atkinson Hyperlegible Next Variable"', "ui-sans-serif", "system-ui", "sans-serif"],
      },
      keyframes: {
        "draw-in": { from: { strokeDashoffset: "1" }, to: { strokeDashoffset: "0" } },
        pulse_node: { "0%,100%": { opacity: "0.45" }, "50%": { opacity: "1" } },
      },
      animation: {
        "draw-in": "draw-in 1.4s cubic-bezier(.6,0,.2,1) forwards",
      },
    },
  },
  plugins: [animate],
};

export default config;
