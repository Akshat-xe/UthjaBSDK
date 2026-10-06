'use strict';

const readline = require('node:readline/promises');
const { stdin, stdout } = require('node:process');
const { openLogin, captureAttendance } = require('../backend/features/sync/browserSources');

async function main() {
  const source = process.argv[2];
  if (!['newton', 'rishiverse'].includes(source)) {
    console.error('Usage: node scripts/connect-attendance.cjs newton|rishiverse');
    process.exitCode = 2;
    return;
  }
  const login = await openLogin({ source });
  if (!login.close) {
    console.error(login.error?.message || 'Could not open the attendance sign-in browser.');
    process.exitCode = 1;
    return;
  }
  const prompt = readline.createInterface({ input: stdin, output: stdout });
  try {
    console.log(`The private ${source} sign-in browser is open. Complete sign-in there if needed.`);
    if (login.error?.message) console.log(login.error.message);
    await prompt.question('Press Return after the attendance page is visible: ');
  } finally {
    prompt.close();
    await login.close();
  }
  try {
    const result = await captureAttendance({ source });
    if (!result?.items?.length) {
      console.error(`${source} attendance returned no subjects. Check your sign-in.`);
      process.exitCode = 1;
      return;
    }
    console.log(`${source} attendance connected: ${result.items.length} subjects.`);
  } catch (error) {
    console.error(error.message || 'Attendance capture needs attention.');
    process.exitCode = 1;
  }
}

main().catch(() => {
  console.error('Attendance setup failed; private diagnostics are hidden.');
  process.exitCode = 1;
});
