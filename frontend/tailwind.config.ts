import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

/** HSL token exposed with Tailwind's alpha channel so `bg-success/10` works. */
const token = (name: string) => `hsl(var(--${name}) / <alpha-value>)`;

const systemSans = [
  "ui-sans-serif",
  "system-ui",
  "-apple-system",
  "Segoe UI",
  "Roboto",
  "Helvetica Neue",
  "Arial",
  "sans-serif",
];
const systemMono = ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "Liberation Mono", "monospace"];

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-geist-sans)", ...systemSans],
        mono: ["var(--font-geist-mono)", ...systemMono],
        serif: ["var(--font-serif)", "Georgia", "Times New Roman", "serif"],
      },
      // DESIGN.md section 4 scale. Each entry carries its own leading, tracking and weight.
      fontSize: {
        display: ["clamp(2.5rem, 6vw, 4rem)", { lineHeight: "1.02", letterSpacing: "-0.035em", fontWeight: "600" }],
        h2: ["clamp(1.75rem, 3.2vw, 2.5rem)", { lineHeight: "1.1", letterSpacing: "-0.025em", fontWeight: "600" }],
        h3: ["1.25rem", { lineHeight: "1.3", letterSpacing: "-0.015em", fontWeight: "600" }],
        lead: ["1.0625rem", { lineHeight: "1.6" }],
        body: ["0.9375rem", { lineHeight: "1.6" }],
        small: ["0.8125rem", { lineHeight: "1.5" }],
        table: ["0.8125rem", { lineHeight: "1.25rem" }],
        eyebrow: ["0.6875rem", { lineHeight: "1", letterSpacing: "0.08em", fontWeight: "500" }],
        kpi: ["1.75rem", { lineHeight: "1.1", letterSpacing: "-0.02em", fontWeight: "500" }],
      },
      colors: {
        background: token("background"),
        foreground: token("foreground"),
        surface: { DEFAULT: token("surface"), 2: token("surface-2") },
        border: { DEFAULT: token("border"), strong: token("border-strong") },
        subtle: { foreground: token("subtle-foreground") },
        primary: { DEFAULT: token("primary"), foreground: token("primary-foreground") },
        ring: token("ring"),
        success: token("success"),
        warning: token("warning"),
        danger: token("danger"),
        info: token("info"),
        // shadcn aliases mapped onto the same tokens so existing class names keep compiling.
        card: { DEFAULT: token("surface"), foreground: token("foreground") },
        popover: { DEFAULT: token("surface"), foreground: token("foreground") },
        muted: { DEFAULT: token("surface-2"), foreground: token("muted-foreground") },
        accent: { DEFAULT: token("surface-2"), foreground: token("foreground") },
        secondary: { DEFAULT: token("surface-2"), foreground: token("foreground") },
        destructive: { DEFAULT: token("danger"), foreground: "hsl(0 0% 100% / <alpha-value>)" },
        input: token("border"),
      },
      // --radius is 6 px: sm 4 (chips), md 6 (buttons, inputs), lg 8 (cards, dialogs), xl 12 (product frame).
      borderRadius: {
        sm: "calc(var(--radius) - 2px)",
        md: "var(--radius)",
        lg: "calc(var(--radius) + 2px)",
        xl: "calc(var(--radius) + 6px)",
      },
      boxShadow: {
        // 1 px inner top highlight: the only "lighting" allowed on dark surfaces.
        highlight: "inset 0 1px 0 0 hsl(0 0% 100% / 0.06)",
        popover: "0 12px 32px -12px hsl(240 10% 2% / 0.7), 0 0 0 1px hsl(var(--border))",
      },
      transitionTimingFunction: {
        "out-expo": "cubic-bezier(0.16, 1, 0.3, 1)",
        "out-quart": "cubic-bezier(0.25, 1, 0.5, 1)",
      },
      transitionDuration: {
        600: "600ms",
      },
    },
  },
  plugins: [animate],
};
export default config;
