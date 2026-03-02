import type { MetadataRoute } from "next";
import { resolveConfig } from "@/config/env";

export default function sitemap(): MetadataRoute.Sitemap {
  const { club } = resolveConfig();
  return [
    {
      url: `https://${club.domain}`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
  ];
}
