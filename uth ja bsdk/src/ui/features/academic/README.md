# Academic feature

`snapshotDate.ts` converts date labels from imported NST timetable snapshots into current Past, Today, or Upcoming badges. It removes stale source labels such as “Today, Sep 24” when that snapshot is viewed on a later date.

`weeklyTimetable.ts` builds the selected Monday–Friday timetable. It combines saved NST lesson topics with the existing Section D RUFP classes from `routine/schedule.ts` (through the app's `tasks(date)`, so personal timing/room overrides apply). A saved NST lesson whose subject is the same RUFP class becomes a topic on that one RUFP row; its time and room come from the PDF-based routine. The UI labels NST and RUFP sources separately and does not modify the saved snapshot.

The timetable, attendance, mail, and notes pages are still rendered by `src/ui/app.ts`. The next migration phase moves those renderers here with shared typed academic snapshot models; see `docs/features/README.md`.
