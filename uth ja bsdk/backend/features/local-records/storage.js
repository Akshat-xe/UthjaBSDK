const fs = require('fs');
const path = require('path');
const { seedHabits } = require('./seedData');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const HABITS_FILE = path.join(DATA_DIR, 'habits.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function getSettings() {
  ensureDataDir();
  if (!fs.existsSync(SETTINGS_FILE)) {
    const defaultSettings = {
      killSwitch: false,
      soundEnabled: true,
      volume: 1.0,
      vibrate: true,
      lastUpdated: new Date().toISOString(),
    };
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(defaultSettings, null, 2));
    return defaultSettings;
  }
  try {
    const raw = fs.readFileSync(SETTINGS_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error reading settings:', err);
    return { killSwitch: false, soundEnabled: true, volume: 1.0 };
  }
}

function updateSettings(patch) {
  ensureDataDir();
  const current = getSettings();
  const updated = {
    ...current,
    ...patch,
    lastUpdated: new Date().toISOString(),
  };
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(updated, null, 2));
  return updated;
}

function getHabits() {
  ensureDataDir();
  if (!fs.existsSync(HABITS_FILE)) {
    return seedDatabase();
  }
  try {
    const raw = fs.readFileSync(HABITS_FILE, 'utf8');
    const data = JSON.parse(raw);
    if (!Array.isArray(data) || data.length === 0) {
      return seedDatabase();
    }
    return data;
  } catch (err) {
    console.error('Error reading habits.json, re-seeding:', err);
    return seedDatabase();
  }
}

function saveHabits(habits) {
  ensureDataDir();
  fs.writeFileSync(HABITS_FILE, JSON.stringify(habits, null, 2));
  return habits;
}

const LOGS_FILE = path.join(DATA_DIR, 'disciplineLogs.json');

function getDisciplineLogs() {
  ensureDataDir();
  if (!fs.existsSync(LOGS_FILE)) {
    return [];
  }
  try {
    const raw = fs.readFileSync(LOGS_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    return [];
  }
}

function recordDisciplineLog(entry) {
  ensureDataDir();
  const logs = getDisciplineLogs();
  const newLog = {
    id: Date.now(),
    timestamp: new Date().toISOString(),
    habitName: entry.habitName || 'Routine Protocol',
    verification: entry.verification || 'acknowledged',
    notes: entry.notes || '',
  };
  logs.unshift(newLog);
  fs.writeFileSync(LOGS_FILE, JSON.stringify(logs.slice(0, 100), null, 2));
  return newLog;
}

// --- ACADEMIC ATTENDANCE MANAGEMENT (NewtonSchool & Rishiverse LMS) ---
const ATTENDANCE_FILE = path.join(DATA_DIR, 'academicAttendance.json');

function getInitialAttendanceData() {
  // Start empty. A source update or a local import supplies real attendance.
  return {
    totalXP: 0,
    totalLectures: 0,
    overallAttendancePercent: 0,
    attendedCount: 0,
    scheduledCount: 0,
    subjects: [],
  };
}

function getAttendanceData() {
  ensureDataDir();
  if (!fs.existsSync(ATTENDANCE_FILE)) {
    const initial = getInitialAttendanceData();
    fs.writeFileSync(ATTENDANCE_FILE, JSON.stringify(initial, null, 2));
    return initial;
  }
  try {
    const raw = fs.readFileSync(ATTENDANCE_FILE, 'utf8');
    const data = JSON.parse(raw);
    // Keep existing local records; only reseed malformed files.
    if (!Array.isArray(data.subjects)) {
      const initial = getInitialAttendanceData();
      fs.writeFileSync(ATTENDANCE_FILE, JSON.stringify(initial, null, 2));
      return initial;
    }
    return data;
  } catch (err) {
    const initial = getInitialAttendanceData();
    return initial;
  }
}

function toggleSubjectSession({ subjectId, sessionIndex, newStatus }) {
  ensureDataDir();
  const data = getAttendanceData();
  const subject = data.subjects.find((s) => s.id === subjectId);
  if (!subject || !subject.sessions || !subject.sessions[sessionIndex]) {
    return { success: false, error: 'Subject or session not found' };
  }

  const session = subject.sessions[sessionIndex];
  if (newStatus) {
    session.status = newStatus;
  } else {
    // Cycle: present -> absent -> holiday -> present
    if (session.status === 'present') session.status = 'absent';
    else if (session.status === 'absent') session.status = 'holiday';
    else session.status = 'present';
  }

  // Recalculate subject attendance
  const attended = subject.sessions.filter((s) => s.status === 'present').length;
  const conducted = subject.sessions.filter(
    (s) => s.status === 'present' || s.status === 'absent',
  ).length;
  subject.attended = attended;
  subject.conducted = conducted;
  subject.percent = conducted > 0 ? Math.round((attended / conducted) * 100) : 100;

  // Recalculate grand totals
  let grandAttended = 0;
  let grandConducted = 0;
  data.subjects.forEach((s) => {
    grandAttended += s.attended || 0;
    grandConducted += s.conducted || 0;
  });

  data.attendedCount = grandAttended;
  data.scheduledCount = grandConducted;
  data.overallAttendancePercent =
    grandConducted > 0 ? Math.round((grandAttended / grandConducted) * 100) : 0;
  data.totalXP = grandAttended * 30;

  fs.writeFileSync(ATTENDANCE_FILE, JSON.stringify(data, null, 2));
  return { success: true, data, updatedSubject: subject, updatedSession: session };
}

function markAcademicSession(entry) {
  ensureDataDir();
  const data = getAttendanceData();

  // Route to the appropriate subject session if available
  const matchedSubject = data.subjects.find(
    (s) =>
      s.id === entry.subjectId ||
      s.name.toLowerCase().includes((entry.subject || '').toLowerCase()),
  );

  if (matchedSubject && matchedSubject.sessions) {
    const nextFutureIdx = matchedSubject.sessions.findIndex((s) => s.status === 'future');
    if (nextFutureIdx !== -1) {
      return toggleSubjectSession({
        subjectId: matchedSubject.id,
        sessionIndex: nextFutureIdx,
        newStatus: entry.status || 'present',
      });
    }
  }

  return { success: true, data };
}

function seedDatabase() {
  ensureDataDir();
  let nextHabitId = 1;
  let nextAlarmId = 1;

  const seeded = seedHabits.map((item) => {
    const habitId = nextHabitId++;
    const alarms = (item.alarms || []).map((alarm) => ({
      id: nextAlarmId++,
      habitId: habitId,
      hour: Number(alarm.hour),
      minute: Number(alarm.minute),
      daysOfWeek: alarm.daysOfWeek || '1,2,3,4,5,6,7',
    }));

    return {
      id: habitId,
      name: item.name,
      description: item.description || '',
      isCritical: Boolean(item.isCritical),
      isEnabled: item.isEnabled !== false,
      color: item.color || '#0071e3',
      category: item.category || 'routine',
      requiresSelfie: Boolean(item.requiresSelfie),
      hasChecklist: Boolean(item.hasChecklist),
      isEveningCheckin: Boolean(item.isEveningCheckin),
      alarms: alarms,
      createdAt: new Date().toISOString(),
    };
  });

  saveHabits(seeded);
  return seeded;
}

function createHabit(habitData) {
  const habits = getHabits();
  const newId = habits.length > 0 ? Math.max(...habits.map((h) => h.id || 0)) + 1 : 1;
  let nextAlarmId = 1000 + (Date.now() % 10000);

  const alarms = (habitData.alarms || []).map((a) => ({
    id: nextAlarmId++,
    habitId: newId,
    hour: Number(a.hour),
    minute: Number(a.minute),
    daysOfWeek: a.daysOfWeek || '1,2,3,4,5,6,7',
  }));

  const newHabit = {
    id: newId,
    name: habitData.name.trim(),
    description: (habitData.description || '').trim(),
    isCritical: Boolean(habitData.isCritical),
    isEnabled: habitData.isEnabled !== false,
    color: habitData.color || '#64B5F6',
    category: habitData.category || 'custom',
    alarms: alarms,
    createdAt: new Date().toISOString(),
  };

  habits.push(newHabit);
  saveHabits(habits);
  return newHabit;
}

function updateHabit(id, habitData) {
  const habits = getHabits();
  const index = habits.findIndex((h) => h.id === Number(id));
  if (index === -1) return null;

  let nextAlarmId = 2000 + (Date.now() % 10000);
  const alarms = (habitData.alarms || []).map((a) => ({
    id: a.id || nextAlarmId++,
    habitId: Number(id),
    hour: Number(a.hour),
    minute: Number(a.minute),
    daysOfWeek: a.daysOfWeek || '1,2,3,4,5,6,7',
  }));

  const updatedHabit = {
    ...habits[index],
    name: habitData.name !== undefined ? habitData.name.trim() : habits[index].name,
    description:
      habitData.description !== undefined
        ? habitData.description.trim()
        : habits[index].description,
    isCritical:
      habitData.isCritical !== undefined ? Boolean(habitData.isCritical) : habits[index].isCritical,
    isEnabled:
      habitData.isEnabled !== undefined ? Boolean(habitData.isEnabled) : habits[index].isEnabled,
    color: habitData.color || habits[index].color,
    category: habitData.category || habits[index].category,
    alarms: alarms,
    updatedAt: new Date().toISOString(),
  };

  habits[index] = updatedHabit;
  saveHabits(habits);
  return updatedHabit;
}

function deleteHabit(id) {
  const habits = getHabits();
  const filtered = habits.filter((h) => h.id !== Number(id));
  if (filtered.length === habits.length) return false;
  saveHabits(filtered);
  return true;
}

function toggleHabit(id, isEnabled) {
  const habits = getHabits();
  const habit = habits.find((h) => h.id === Number(id));
  if (!habit) return null;
  habit.isEnabled = isEnabled !== undefined ? Boolean(isEnabled) : !habit.isEnabled;
  saveHabits(habits);
  return habit;
}

module.exports = {
  getHabits,
  createHabit,
  updateHabit,
  deleteHabit,
  toggleHabit,
  seedDatabase,
  getSettings,
  updateSettings,
  getDisciplineLogs,
  recordDisciplineLog,
  getAttendanceData,
  markAcademicSession,
  toggleSubjectSession,
};
