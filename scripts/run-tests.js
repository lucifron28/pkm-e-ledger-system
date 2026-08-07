/* eslint-disable @typescript-eslint/no-require-imports */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const mode = process.argv[2] || "all";

function discoverTestFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files = files.concat(discoverTestFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".test.ts")) {
      files.push(fullPath);
    }
  }
  return files;
}

const testsDir = path.join(__dirname, "..", "tests");
let targetFiles = [];

if (mode === "core") {
  targetFiles = discoverTestFiles(path.join(testsDir, "core"));
} else if (mode === "integration") {
  targetFiles = discoverTestFiles(path.join(testsDir, "integration"));
} else if (mode === "migrations") {
  targetFiles = discoverTestFiles(path.join(testsDir, "migrations"));
} else {
  targetFiles = discoverTestFiles(testsDir);
}

if (targetFiles.length === 0) {
  console.error(`No test files found for mode: ${mode}`);
  process.exit(1);
}
const relativeFiles = targetFiles.map((f) => path.relative(process.cwd(), f));
const setupPath = path.resolve(__dirname, "test-setup.js");
const npxCmd = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(npxCmd, ["tsx", "-r", setupPath, "--test", ...relativeFiles], {
  stdio: "inherit",
  shell: process.platform === "win32",
});

if (result.error) {
  console.error("Test execution failed to spawn:", result.error);
  process.exit(1);
}

if (typeof result.status === "number") {
  process.exit(result.status);
}

console.error("Test runner terminated unexpectedly without status code.");
process.exit(1);
