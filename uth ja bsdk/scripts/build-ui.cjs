const fs = require('node:fs');
const path = require('node:path');

const output = path.join(__dirname, '..', 'public', 'build');
fs.mkdirSync(output, { recursive: true });
fs.copyFileSync(
  path.join(__dirname, '..', 'src', 'ui', 'styles', 'app.css'),
  path.join(output, 'app.css'),
);
fs.copyFileSync(
  path.join(__dirname, '..', 'src', 'ui', 'styles', 'sidebar.css'),
  path.join(output, 'sidebar.css'),
);
fs.copyFileSync(
  path.join(__dirname, '..', 'src', 'ui', 'styles', 'routine.css'),
  path.join(output, 'routine.css'),
);
fs.copyFileSync(
  path.join(__dirname, '..', 'src', 'ui', 'styles', 'food.css'),
  path.join(output, 'food.css'),
);
fs.copyFileSync(
  path.join(__dirname, '..', 'src', 'ui', 'styles', 'academic.css'),
  path.join(output, 'academic.css'),
);
fs.copyFileSync(
  path.join(__dirname, '..', 'src', 'ui', 'styles', 'update-control.css'),
  path.join(output, 'update-control.css'),
);
fs.writeFileSync(path.join(output, 'package.json'), '{"type":"module"}\n');
