import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    /*
     * Ranh giới dữ liệu (docs/04-data-contract.md, mục "Quy tắc lớp dữ liệu"):
     * component và trang chỉ được lấy dữ liệu qua lib/data (file index.ts).
     * Cấm import thẳng fixtures/ và lib/data/mock từ app/ và components/.
     */
    files: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/fixtures", "**/fixtures/**", "**/lib/data/mock", "**/lib/data/mock/**"],
              message:
                "Chỉ được lấy dữ liệu qua lib/data (index.ts). Xem docs/04-data-contract.md, mục 'Quy tắc lớp dữ liệu'.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
