// Generic first-run examples. Personal schedules belong in ignored backend/data/.
const seedHabits = [
  {
    name: 'Morning check-in',
    description: 'Start the day and choose your priorities.',
    isCritical: false,
    isEnabled: true,
    color: '#34c759',
    category: 'morning',
    alarms: [],
  },
  {
    name: 'Prepare for the day',
    description: 'Review your bag and schedule.',
    isCritical: false,
    isEnabled: true,
    color: '#5856d6',
    category: 'morning',
    hasChecklist: true,
    alarms: [],
  },
  {
    name: 'Study block',
    description: 'Focus on one planned task.',
    isCritical: false,
    isEnabled: true,
    color: '#0071e3',
    category: 'routine',
    alarms: [],
  },
  {
    name: 'Evening check-in',
    description: 'Review what was completed today.',
    isCritical: false,
    isEnabled: true,
    color: '#ff9500',
    category: 'routine',
    isEveningCheckin: true,
    alarms: [],
  },
];

module.exports = { seedHabits };
