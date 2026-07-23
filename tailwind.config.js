/** @type {import('tailwindcss').Config} */

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    container: {
      center: true,
    },
    extend: {
      colors: {
        // 主色调：深墨蓝学术系
        ink: {
          50: "#F0F4F8",
          100: "#D9E2EC",
          200: "#BCCCDC",
          300: "#9FB3C8",
          400: "#7B8FA6",
          500: "#486581",
          600: "#334E68",
          700: "#243B53",
          800: "#102A43",
          900: "#0B2545",
          950: "#06182E",
        },
        // 强调色：学术金
        gold: {
          50: "#FBF7EE",
          100: "#F5EAD0",
          200: "#EFD5A0",
          300: "#E8BD66",
          400: "#D4A24C",
          500: "#B8842F",
          600: "#946623",
          700: "#6F4C1B",
          800: "#4A3212",
          900: "#2E1F0A",
        },
        // 次级强调：淡青
        teal: {
          50: "#EEF7FB",
          100: "#D5ECF5",
          200: "#B0D9EA",
          300: "#7FB3D5",
          400: "#5A95BF",
          500: "#3D77A1",
          600: "#2C5A80",
          700: "#1F4361",
          800: "#142E45",
          900: "#0A1A2C",
        },
        // 中性背景
        paper: "#FFFFFF",
        mist: "#F5F7FA",
        haze: "#E8ECF1",
      },
      fontFamily: {
        serif: ['"Noto Serif SC"', '"Source Han Serif SC"', "Georgia", "serif"],
        sans: ['"Noto Sans SC"', '"PingFang SC"', '"Microsoft YaHei"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', '"Fira Code"', "ui-monospace", "monospace"],
      },
      boxShadow: {
        card: "0 1px 2px 0 rgba(16, 42, 67, 0.04), 0 4px 12px 0 rgba(16, 42, 67, 0.06)",
        cardHover: "0 2px 4px 0 rgba(16, 42, 67, 0.06), 0 12px 24px 0 rgba(16, 42, 67, 0.10)",
        gold: "0 0 0 1px rgba(212, 162, 76, 0.3), 0 4px 12px rgba(212, 162, 76, 0.15)",
      },
      borderRadius: {
        xl: "10px",
        "2xl": "14px",
      },
      animation: {
        "fade-in": "fadeIn 0.3s ease-out",
        "slide-up": "slideUp 0.35s cubic-bezier(0.16, 1, 0.3, 1)",
        "slide-in-right": "slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
        "scale-in": "scaleIn 0.2s ease-out",
        "shimmer": "shimmer 1.8s linear infinite",
        "pulse-soft": "pulseSoft 2s ease-in-out infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        slideInRight: {
          "0%": { opacity: "0", transform: "translateX(16px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        scaleIn: {
          "0%": { opacity: "0", transform: "scale(0.96)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-1000px 0" },
          "100%": { backgroundPosition: "1000px 0" },
        },
        pulseSoft: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.6" },
        },
      },
    },
  },
  plugins: [],
};
