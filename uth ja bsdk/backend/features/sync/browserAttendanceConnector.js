'use strict';

const { captureAttendance } = require('./browserSources');

function attendanceTask(source, capture = captureAttendance) {
  return async () => {
    try {
      const result = await capture({ source });
      if (!Array.isArray(result?.items) || result.items.length === 0) {
        throw new Error(`${source} browser did not return attendance rows.`);
      }
      return { items: result.items };
    } catch (error) {
      if (['AUTH_REQUIRED', 'CONFIG_REQUIRED', 'SETUP_REQUIRED'].includes(error?.code)) {
        const setupError = new Error(
          source === 'newton'
            ? 'NST browser sign-in needed on the laptop. Run the local attendance setup, then Sync again.'
            : 'RUFP browser sign-in needed on the laptop. Complete Google sign-in there, then Sync again.',
        );
        setupError.code = 'CONFIG_REQUIRED';
        throw setupError;
      }
      throw error;
    }
  };
}

module.exports = { attendanceTask };
