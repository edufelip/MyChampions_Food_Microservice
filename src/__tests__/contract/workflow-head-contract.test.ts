import { readFileSync } from "node:fs";

const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
const headRef = "ref: ${{ github.event.pull_request.head.sha || github.sha }}";
const expectedSha =
  "EXPECTED_SHA: ${{ github.event.pull_request.head.sha || github.sha }}";

function extractJobBlocks(source: string): Map<string, string> {
  const jobsSection = source.slice(source.indexOf("\njobs:\n"));
  const jobStarts = [
    ...jobsSection.matchAll(/^\x20{2}([A-Za-z0-9_-]+):\s*$/gm),
  ];
  return new Map(
    jobStarts.map((match, index) => [
      match[1],
      jobsSection.slice(match.index, jobStarts[index + 1]?.index),
    ]),
  );
}

function extractNamedStep(job: string, name: string): string {
  const marker = `      - name: ${name}`;
  const start = job.indexOf(marker);
  if (start === -1) return "";

  const step = job.slice(start);
  const nextStep = step.search(/\n\x20{6}- (?:name|id):/);
  const nextJob = step.search(/\n\x20{2}[A-Za-z0-9_-]+:\s*$/m);
  const end = [nextStep, nextJob].filter((value) => value >= 0).sort()[0];
  return step.slice(0, end ?? step.length);
}

describe("CI exact-head checkout contract", () => {
  it("uses the same exact workflow commit for every job checkout", () => {
    const jobs = extractJobBlocks(workflow);
    expect([...jobs.keys()]).toEqual([
      "impact",
      "lint",
      "test",
      "contract",
      "security",
      "build",
      "docker-build",
    ]);

    for (const job of jobs.values()) {
      const checkout = extractNamedStep(job, "Checkout");
      const verify = extractNamedStep(job, "Verify exact checkout");

      expect(checkout.length).toBeGreaterThan(0);
      expect(verify.length).toBeGreaterThan(0);
      expect(checkout).toContain("uses: actions/checkout@v4");
      expect(checkout).toContain("fetch-depth: 0");
      expect(checkout).toContain("persist-credentials: false");
      expect(checkout).toContain(headRef);
      expect(verify).toContain(expectedSha);
      expect(verify).toContain(
        'test "$(git rev-parse HEAD)" = "$EXPECTED_SHA"',
      );
    }
  });
});
