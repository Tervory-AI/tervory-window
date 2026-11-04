const path = require('node:path');
const fs = require('node:fs/promises');
const { runTests } = require('@vscode/test-electron');
(async () => {
  const root = path.resolve(__dirname, '..');
  const tmp = path.resolve(root, '../../.tmp');
  await fs.mkdir(tmp, { recursive: true });
  const scratch = await fs.mkdtemp(path.join(tmp, 'complete-electron-'));
  await fs.mkdir(path.join(scratch, 'project/.tervory'), { recursive: true });
  await fs.writeFile(path.join(scratch, 'project/.tervory/rules'), 'Use clear names.');
  await fs.writeFile(path.join(scratch, 'project/split.js'), 'const splitContext = true;\n');
  await fs.writeFile(path.join(scratch, 'project/near.js'), 'const nearby = 1;\n');
  await fs.writeFile(path.join(scratch, 'project/main.js'), 'function answer() {\n  \n}\n');
  const resultPath = path.join(scratch, 'passed');
  await fs.rm(resultPath, { force: true });
  await runTests({
    extensionTestsEnv: { TERVORY_TEST_RESULT: resultPath },
    ...(process.env.VSCODE_EXECUTABLE_PATH ? { vscodeExecutablePath: process.env.VSCODE_EXECUTABLE_PATH } : {}),
    extensionDevelopmentPath: process.env.TERVORY_BUILT_WINDOW === '1' ? root : [root, path.resolve(root, '../../extension')],
    extensionTestsPath: path.join(__dirname, 'suite.cjs'),
    launchArgs: [path.join(scratch, 'project'), '--no-sandbox', '--disable-gpu', '--disable-extensions',
      '--skip-welcome', '--skip-release-notes', '--disable-workspace-trust',
      `--user-data-dir=${path.join(scratch, 'user')}`, `--extensions-dir=${path.join(scratch, 'extensions')}`],
  });
  if (await fs.readFile(resultPath, 'utf8') !== 'passed') throw new Error('Editor suite did not pass');
})().catch(error => { console.error(error); process.exitCode = 1; });
