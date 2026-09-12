import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Vercel application-build configuration", () => {
  it("invokes the shared repository-owned gate", () => {
    const config: { ignoreCommand?: string } = JSON.parse(
      readFileSync(join(process.cwd(), "vercel.json"), "utf8")
    );

    expect(config.ignoreCommand).toBe("bash scripts/ignore-build-step.sh");
  });
});
