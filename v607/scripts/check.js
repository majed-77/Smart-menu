"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..");
const files = [];

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(fullPath);
    else if (entry.name.endsWith(".js")) files.push(fullPath);
  }
}

walk(root);

let failed = false;
for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (result.status !== 0) {
    failed = true;
    console.error(`✗ ${path.relative(root, file)}`);
    console.error(result.stderr || result.stdout);
  }
}

if (failed) process.exit(1);
console.log(`✓ Syntax check passed for ${files.length} JavaScript files.`);
