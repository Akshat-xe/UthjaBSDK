import fs from 'node:fs';
const ATTENDANCE_PATH = process.env.ATTENDANCE_PATH;

export const attendanceEngine = {
  getAttendanceSnapshot() {
    try {
      if (ATTENDANCE_PATH && fs.existsSync(ATTENDANCE_PATH)) {
        const raw = fs.readFileSync(ATTENDANCE_PATH, 'utf8');
        const data = JSON.parse(raw);
        if (
          !Number.isFinite(data.attendedCount) ||
          !Number.isFinite(data.scheduledCount) ||
          data.attendedCount < 0 ||
          data.scheduledCount <= 0 ||
          data.attendedCount > data.scheduledCount
        )
          return null;
        return {
          ...data,
          overallAttendancePercent:
            Math.round((data.attendedCount / data.scheduledCount) * 1000) / 10,
        };
      }
    } catch (e) {
      console.warn('Could not read academicAttendance.json directly:', e.message);
    }
    return null;
  },

  /**
   * Evaluates date span against college schedule and 75% attendance rule.
   * @param {string|Date} startDate
   * @param {string|Date} endDate
   */
  evaluateEventSchedule(startDate, endDate) {
    const unknown = (reason) => ({
      leaves_required: null,
      attendance_safe: null,
      projectedAttendance: null,
      isWeekend: false,
      confidence: 'unknown',
      reason,
    });
    if (!startDate || !endDate)
      return unknown('Event dates are unverified. Check the official schedule.');

    const start = new Date(startDate);
    const end = endDate ? new Date(endDate) : new Date(startDate);

    if (
      !Number.isFinite(+start) ||
      !Number.isFinite(+end) ||
      end < start ||
      end - start > 366 * 86400000
    ) {
      return unknown('Invalid or unsupported event date range.');
    }
    // Dates alone cannot establish class conflicts: the source has no verified
    // semester calendar, holiday rules, or event participation hours.
    return unknown(
      'Dates available, but class conflicts and required participation hours need verification.',
    );
  },
};

// Quick self-test if run directly
if (process.argv[1]?.endsWith('attendanceEngine.js')) {
  console.log('--- Testing Attendance Engine ---');
  const snap = attendanceEngine.getAttendanceSnapshot();
  console.log(
    `Current Overall Attendance: ${snap?.overallAttendancePercent}% (${snap?.attendedCount}/${snap?.scheduledCount} lectures)`,
  );

  const weekendEval = attendanceEngine.evaluateEventSchedule('2026-10-03', '2026-10-04');
  console.log('Weekend Hackathon Test:', weekendEval);

  const weekdayEval = attendanceEngine.evaluateEventSchedule('2026-10-07', '2026-10-09');
  console.log('3-Day Weekday Hackathon Test:', weekdayEval);
}
