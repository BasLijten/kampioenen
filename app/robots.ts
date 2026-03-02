import type { MetadataRoute } from "next";
import { resolveConfig } from "@/config/env";

export default function robots(): MetadataRoute.Robots {
  const { club } = resolveConfig();
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: `https://${club.domain}/sitemap.xml`,
  };
}
