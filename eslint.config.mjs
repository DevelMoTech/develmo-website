import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Pre-existing public-site code predates the stricter rules that arrived
    // with eslint-config-next 16 (react-hooks v6, jsx-no-comment-textnodes on
    // the decorative "// FEATURED" labels). The public site must not be
    // refactored in the dashboard work, so these stay warnings for exactly
    // these files. They remain errors for all new code.
    files: [
      "src/app/(site)/page.tsx",
      "src/components/ContactForm.tsx",
      "src/components/MegaNav.tsx",
      "src/components/SiteFooter.tsx",
      "src/components/ThemeToggle.tsx",
    ],
    rules: {
      "react/jsx-no-comment-textnodes": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn",
    },
  },
  {
    // Uploaded library images are served from this origin already sized by
    // the editor; the console's thumbnails and the post hero use a plain
    // <img> like the rest of the public site (which has no next/image usage)
    // rather than routing every upload through the image optimiser.
    files: ["src/app/(admin)/**/*.tsx", "src/components/PostArticle.tsx"],
    rules: {
      "@next/next/no-img-element": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Verification builds run with NEXT_DIST_DIR=.next-build (see next.config.ts).
    ".next-build/**",
  ]),
]);

export default eslintConfig;
