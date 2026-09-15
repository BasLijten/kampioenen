import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const scriptPath = join(process.cwd(), "scripts", "ignore-build-step.sh");
const temporaryDirectories: string[] = [];

function git(directory: string, ...args: string[]): string {
  return execFileSync("git", args, {
    cwd: directory,
    encoding: "utf8",
  }).trim();
}

function writeFile(directory: string, path: string, contents: string): void {
  const filePath = join(directory, path);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, contents);
}

function commit(directory: string, message: string): string {
  git(directory, "add", "--all");
  git(directory, "commit", "--quiet", "-m", message);
  return git(directory, "rev-parse", "HEAD");
}

function createRepository(): { directory: string; baseline: string } {
  const directory = mkdtempSync(join(tmpdir(), "kampioenen-ignore-build-step-"));
  temporaryDirectories.push(directory);

  git(directory, "init", "--quiet");
  git(directory, "config", "user.email", "tests@example.com");
  git(directory, "config", "user.name", "Tests");
  writeFile(directory, "app/page.tsx", "export default function Page() { return null; }\n");

  return { directory, baseline: commit(directory, "baseline") };
}

function runGate(
  directory: string,
  previousSha: string | undefined,
  commitSha: string | undefined,
  extraEnvironment: Record<string, string | undefined> = {}
): { status: number; output: string } {
  const result = spawnSync("bash", [scriptPath], {
    cwd: directory,
    encoding: "utf8",
    env: {
      ...process.env,
      VERCEL_GIT_PREVIOUS_SHA: previousSha,
      VERCEL_GIT_COMMIT_SHA: commitSha,
      ...extraEnvironment,
    },
  });

  return {
    status: result.status ?? 1,
    output: `${result.stdout}${result.stderr}`,
  };
}

function changeAndCommit(directory: string, path: string): string {
  writeFile(directory, path, `changed: ${path}\n`);
  return commit(directory, `change ${path}`);
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("documentation-only Vercel build gate", () => {
  it.each(["AGENTS.md", "README.md", "docs/guide.md", "docs/nested/guide.md", ".agents/skills/example/SKILL.md"])(
    "skips the application build for %s",
    (path) => {
      const { directory, baseline } = createRepository();
      const current = changeAndCommit(directory, path);

      expect(runGate(directory, baseline, current).status).toBe(0);
    }
  );

  it("skips the application build for a known empty diff", () => {
    const { directory, baseline } = createRepository();

    expect(runGate(directory, baseline, baseline).status).toBe(0);
  });

  it.each([
    "app/page.tsx",
    "components/header.tsx",
    "next.config.ts",
    "package.json",
    "package-lock.json",
    "scripts/simulate.ts",
    "data/eredivisie.json",
    "public/logo.svg",
    "notes.txt",
    "nested/AGENTS.md",
    "nested/README.md",
    "docs/guide.md",
  ])("runs the application build for %s when it is mixed or outside the allowlist", (path) => {
    const { directory, baseline } = createRepository();
    const current = changeAndCommit(directory, path);

    if (path === "docs/guide.md") {
      writeFile(directory, "app/page.tsx", "changed application code\n");
      const mixedCurrent = commit(directory, "mixed change");
      expect(runGate(directory, baseline, mixedCurrent).status).toBe(1);
      return;
    }

    expect(runGate(directory, baseline, current).status).toBe(1);
  });

  it("runs the application build when a rename crosses the allowlist boundary", () => {
    const { directory, baseline } = createRepository();
    mkdirSync(join(directory, "docs"));
    git(directory, "mv", "app/page.tsx", "docs/page.tsx");
    const current = commit(directory, "rename application file to docs");

    expect(runGate(directory, baseline, current).status).toBe(1);
  });

  it("runs the application build when an allowlisted file is renamed outside the allowlist", () => {
    const { directory, baseline } = createRepository();
    writeFile(directory, "docs/page.tsx", "documentation\n");
    const docsCommit = commit(directory, "add documentation file");
    mkdirSync(join(directory, "app"), { recursive: true });
    git(directory, "mv", "docs/page.tsx", "app/renamed-page.tsx");
    const current = commit(directory, "rename docs file to application");

    expect(runGate(directory, docsCommit, current).status).toBe(1);
    expect(baseline).not.toBe(docsCommit);
  });

  it("skips the application build when an allowlisted file is deleted", () => {
    const { directory } = createRepository();
    writeFile(directory, "docs/page.md", "documentation\n");
    const docsCommit = commit(directory, "add documentation file");
    git(directory, "rm", "--quiet", "docs/page.md");
    const current = commit(directory, "delete documentation file");

    expect(runGate(directory, docsCommit, current).status).toBe(0);
  });

  it("runs the application build when an application file is deleted", () => {
    const { directory, baseline } = createRepository();
    git(directory, "rm", "--quiet", "app/page.tsx");
    const current = commit(directory, "delete application file");

    expect(runGate(directory, baseline, current).status).toBe(1);
  });

  it.each([
    [undefined, "missing previous revision"],
    ["", "first deployment"],
  ] as Array<[string | undefined, string]>) ("fails open for a %s", (previousSha, description) => {
    void description;
    const { directory, baseline } = createRepository();
    const current = changeAndCommit(directory, "docs/guide.md");

    expect(runGate(directory, previousSha, current).status).toBe(1);
    expect(baseline).toHaveLength(40);
  });

  it("fails open when the current revision is missing", () => {
    const { directory, baseline } = createRepository();

    expect(runGate(directory, baseline, undefined).status).toBe(1);
  });

  it("fails open when either revision is not a commit in the repository", () => {
    const { directory, baseline } = createRepository();
    const current = changeAndCommit(directory, "docs/guide.md");

    expect(runGate(directory, "not-a-real-revision", current).status).toBe(1);
    expect(runGate(directory, baseline, "not-a-real-revision").status).toBe(1);
  });

  it("fails open when Git cannot read a validated revision diff", () => {
    const { directory, baseline } = createRepository();
    const current = changeAndCommit(directory, "docs/guide.md");
    const baselineTree = git(directory, "cat-file", "-p", baseline)
      .split("\n", 1)[0]
      .split(" ", 2)[1];
    rmSync(join(directory, ".git", "objects", baselineTree.slice(0, 2), baselineTree.slice(2)));

    expect(runGate(directory, baseline, current).status).toBe(1);
  });

  it("fails open outside a Git repository", () => {
    const directory = mkdtempSync(join(tmpdir(), "kampioenen-ignore-build-step-"));
    temporaryDirectories.push(directory);

    const result = runGate(directory, "previous", "current");

    expect(result.status).toBe(1);
  });

  it("fails open when the previous revision is unavailable in a shallow clone", () => {
    const { directory, baseline } = createRepository();
    const current = changeAndCommit(directory, "docs/guide.md");
    const shallowRoot = mkdtempSync(join(tmpdir(), "kampioenen-ignore-build-step-"));
    const shallowDirectory = join(shallowRoot, "clone");
    temporaryDirectories.push(shallowRoot);

    execFileSync("git", ["clone", "--quiet", "--depth", "1", `file://${directory}`, shallowDirectory]);

    expect(runGate(shallowDirectory, baseline, current).status).toBe(1);
  });

  it("does not expose revision or environment-variable values in its output", () => {
    const { directory } = createRepository();
    const result = runGate(directory, "secret-previous-value", "secret-current-value");

    expect(result.status).toBe(1);
    expect(result.output).not.toContain("secret-previous-value");
    expect(result.output).not.toContain("secret-current-value");
  });
});
