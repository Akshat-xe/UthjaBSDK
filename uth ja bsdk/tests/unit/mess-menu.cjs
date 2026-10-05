const assert = require('node:assert/strict');
const { extractMenu } = require('../../backend/features/menu/remoteMessMenu');

const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const meals = ['breakfast', 'lunch', 'snacks', 'dinner'];
const fields = days
  .map((day) => `${day}:{${meals.map((meal) => `${meal}:["${day} ${meal}"]`).join(',')}}`)
  .join(',');
const menu = extractMenu(`const x=1,g={${fields}},y=new Set([]);`);

assert.deepEqual(menu.Friday.breakfast, ['Friday breakfast']);
assert.deepEqual(menu.Sunday.dinner, ['Sunday dinner']);
assert.deepEqual(Object.keys(menu), days);
assert.throws(
  () => extractMenu('g={Monday:{breakfast:[globalThis.process]}} ,y=new Set('),
  /parsed safely/,
);
assert.throws(
  () => extractMenu('g={Monday:{breakfast:[],lunch:[],snacks:[],dinner:[]}},y=new Set('),
  /missing Tuesday/,
);

console.log(
  'PASS: RU Print menu bundle parser accepts validated weekly menus and rejects executable or incomplete data.',
);
