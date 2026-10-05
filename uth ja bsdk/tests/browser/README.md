# Browser tests

These headless Chrome tests cover routine actions, reminders, Radar, academic pages, and the global update dialog. Set `TEST_BASE_URL` to the local app server (for example `http://localhost:3001`) to keep the suite off the default port. Update-flow API responses are intercepted in the browser test to avoid contacting live integrations.
