const assert = require('node:assert/strict');
const { attendanceTask } = require('../../backend/features/sync/browserAttendanceConnector');

(async () => {
  const items = [{ name: 'Systems', attended: 3, conducted: 4, percent: 75 }];
  assert.deepEqual(await attendanceTask('newton', async () => ({ items }))(), { items });
  await assert.rejects(attendanceTask('newton', async () => ({ items: [] }))(), /did not return attendance rows/);
  await assert.rejects(
    attendanceTask('rishiverse', async () => {
      const error = new Error('private authentication detail');
      error.code = 'AUTH_REQUIRED';
      throw error;
    })(),
    (error) => error.code === 'CONFIG_REQUIRED' && !error.message.includes('private authentication detail'),
  );

  // Setup required for CONFIG_REQUIRED and SETUP_REQUIRED
  await assert.rejects(
    attendanceTask('newton', async () => {
      const error = new Error('profile missing');
      error.code = 'SETUP_REQUIRED';
      throw error;
    })(),
    (error) => error.code === 'CONFIG_REQUIRED',
  );

  // Actual capture failures must preserve their non-CONFIG_REQUIRED error (surfacing 'failed' in connectors)
  await assert.rejects(
    attendanceTask('rishiverse', async () => {
      const error = new Error('API format changed');
      error.code = 'UNSUPPORTED_RESPONSE';
      throw error;
    })(),
    (error) => error.code === 'UNSUPPORTED_RESPONSE',
  );

  await assert.rejects(
    attendanceTask('newton', async () => {
      const error = new Error('Timeout waiting for response');
      error.code = 'ATTENDANCE_UNAVAILABLE';
      throw error;
    })(),
    (error) => error.code === 'ATTENDANCE_UNAVAILABLE',
  );

  console.log('PASS: browser attendance rows and setup failures are mapped safely.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
