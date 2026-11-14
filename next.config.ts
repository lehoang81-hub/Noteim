import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  // cacheComponents tắt: mockup tải dữ liệu ở trình duyệt, chế độ này buộc bọc
  // mọi usePathname/useParams trong <Suspense> mà không đem lại lợi ích gì.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default withNextIntl(nextConfig);
