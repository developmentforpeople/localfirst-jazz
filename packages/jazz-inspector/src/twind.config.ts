import { defineConfig } from "@twind/core";
import presetAutoprefix from "@twind/preset-autoprefix";
import presetTailwind from "@twind/preset-tailwind";

const stonePalette = {
  50: "oklch(0.988281 0.002 75)",
  100: "oklch(0.980563 0.002 75)",
  200: "oklch(0.917969 0.002 75)",
  300: "oklch(0.853516 0.002 75)",
  400: "oklch(0.789063 0.002 75)",
  500: "oklch(0.726563 0.002 75)",
  600: "oklch(0.613281 0.002 75)",
  700: "oklch(0.523438 0.002 75)",
  800: "oklch(0.412109 0.002 75)",
  900: "oklch(0.302734 0.002 75)",
  925: "oklch(0.220000 0.002 75)",
  950: "oklch(0.193359 0.002 75)",
};

const stonePaletteWithAlpha = { ...stonePalette };

Object.keys(stonePalette).forEach((key) => {
  // @ts-ignore
  stonePaletteWithAlpha[key] = stonePaletteWithAlpha[key].replace(
    ")",
    "/ <alpha-value>)",
  );
});

export default defineConfig({
  hash: true,
  presets: [presetAutoprefix(), presetTailwind()],
  theme: {
    extend: {
      colors: {
        stone: stonePaletteWithAlpha,
        gray: stonePaletteWithAlpha,
        blue: {
          50: "#f5f7ff",
          100: "#ebf0fe",
          200: "#d6e0fd",
          300: "#b3c7fc",
          400: "#8aa6f9",
          500: "#5870F1",
          600: "#3651E7",
          700: "#3313F7",
          800: "#2A12BE",
          900: "#12046A",
          950: "#1e1b4b",
          DEFAULT: "#3313F7",
        },
      },
    },
  },
});
