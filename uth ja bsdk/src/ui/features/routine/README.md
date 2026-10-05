# Routine feature

`schedule.ts` defines the semester schedule, date-key/time helpers, class generation, and routine rules used by the browser UI. `app.ts` currently renders the timeline and packing interactions using these helpers.

Keep campus timetable facts here rather than inventing them in page markup. Update `tests/unit/schedule.cjs` and the routine browser test when schedule rules change.

The Academic weekly overview also reads `communication`, `society`, and `india` class entries from `tasks(date)` as the RUFP Foundation schedule for Section D. Edit their PDF-based time or room here; the weekly overview then follows automatically.
