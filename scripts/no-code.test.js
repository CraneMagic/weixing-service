const { execFileSync } = require("node:child_process");
const path = require("node:path");

for (const script of ["test-alarm-target.ts", "test-no-code-frames.ts", "test-no-code-alarm.ts", "test-no-code-api.ts", "test-alarm-recovery.ts", "test-serial-timeout.ts", "test-serial-binding.ts", "test-alarm-expiry.ts"]) {
  test(script, () => {
    const output = execFileSync(process.execPath, [
      require.resolve("ts-node/dist/bin.js"), path.join(__dirname, script),
    ], { cwd: path.join(__dirname, ".."), encoding: "utf8" });
    expect(output).toMatch(/PASS:|失败 0 项/);
  }, 15000);
}
