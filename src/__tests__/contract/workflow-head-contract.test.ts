import { readFileSync } from "node:fs";

const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
const headRef = "ref: ${{ github.event.pull_request.head.sha || github.sha }}";
const expectedSha =
  "EXPECTED_SHA: ${{ github.event.pull_request.head.sha || github.sha }}";

function countLiteral(value: string): number {
  return workflow.split(value).length - 1;
}

describe("CI exact-head checkout contract", () => {
  it("uses the same exact PR head for every job checkout", () => {
    expect(countLiteral("uses: actions/checkout@v4")).toBe(7);
    expect(countLiteral("fetch-depth: 0")).toBe(7);
    expect(countLiteral("persist-credentials: false")).toBe(7);
    expect(countLiteral(headRef)).toBe(7);
    expect(countLiteral(expectedSha)).toBe(7);
    expect(countLiteral('test "$(git rev-parse HEAD)" = "$EXPECTED_SHA"')).toBe(
      7,
    );
  });
});
