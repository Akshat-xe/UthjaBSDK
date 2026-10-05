import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { fetchUnstopHackathons } from '../scrapers/unstop.js';
import { fetchDevpostHackathons } from '../scrapers/devpost.js';
import { attendanceEngine } from '../attendance/attendanceEngine.js';
import { tierEngine } from '../scoring/tierEngine.js';
import { configuredApifySources } from '../scrapers/apify.js';
import { database } from '../db/database.js';

export async function runScraperPipeline(
  triggerType = 'cron_12h',
  sources = {
    unstop: () => fetchUnstopHackathons(15),
    devpost: fetchDevpostHackathons,
    ...configuredApifySources(),
  },
) {
  const startTime = Date.now();
  const runId = `run_${randomUUID()}`;
  const lock = database.db
    .prepare(
      `INSERT INTO pipeline_lock (id, owner, expires_at) VALUES (1, ?, ?)
    ON CONFLICT(id) DO UPDATE SET owner = excluded.owner, expires_at = excluded.expires_at
    WHERE pipeline_lock.expires_at < ? RETURNING owner`,
    )
    .get(runId, startTime + 600000, startTime);
  if (!lock) throw new Error('A harvest is already running (dashboard or scheduler).');
  let total = 0,
    newCount = 0,
    status = 'failed';
  const sourceResults = [];
  try {
    const names = Object.keys(sources);
    const results = await Promise.allSettled(names.map((name) => sources[name]()));
    const items = new Map();
    results.forEach((result, index) => {
      const name = names[index];
      if (result.status === 'rejected') {
        sourceResults.push({
          source: name,
          status: 'failed',
          error: result.reason?.message || String(result.reason),
        });
        return;
      }
      sourceResults.push({
        source: name,
        status: result.value.warnings?.length ? 'partial' : 'success',
        count: result.value.length,
        warnings: result.value.warnings || [],
      });
      for (const item of result.value) {
        const existing = items.get(item.id);
        items.set(
          item.id,
          existing
            ? { ...item, ...existing, raw_data: { ...item.raw_data, ...existing.raw_data } }
            : item,
        );
      }
    });
    total = items.size;
    const failures = sourceResults.filter((s) => s.status === 'failed').length;
    status =
      failures === names.length
        ? 'failed'
        : failures || sourceResults.some((s) => s.status === 'partial')
          ? 'partial'
          : 'success';
    if (status === 'failed')
      throw new Error(sourceResults.map((s) => `${s.source}: ${s.error}`).join('; '));
    database.db.exec('BEGIN IMMEDIATE');
    try {
      database.db.exec('UPDATE opportunities SET is_new = 0');
      for (const raw of items.values()) {
        const attendance = attendanceEngine.evaluateEventSchedule(raw.start_date, raw.end_date);
        const skills = tierEngine.calculateSkillMatch(
          raw.skills_required,
          `${raw.title} ${raw.raw_data?.description || ''}`,
        );
        raw.skill_match_score = skills.score;
        const tier = tierEngine.calculateTier(raw, attendance);
        Object.assign(raw, {
          tier_rating: tier.tier,
          leaves_required: attendance.leaves_required,
          attendance_safe: attendance.attendance_safe,
        });
        raw.raw_data = {
          ...raw.raw_data,
          attendanceReason: attendance.reason,
          attendanceConfidence: attendance.confidence,
          tierReason: tier.reason,
          matchedSkills: skills.matchedSkills,
          mlHeavy: skills.mlHeavy,
        };
        if (database.upsertOpportunity(raw).isNew) newCount++;
        database.refreshStatus(raw.id, raw.status);
      }
      database.db.exec('COMMIT');
    } catch (error) {
      database.db.exec('ROLLBACK');
      status = 'failed';
      throw error;
    }
    return {
      runId,
      total,
      newCount,
      durationMs: Date.now() - startTime,
      status,
      sources: sourceResults,
    };
  } finally {
    try {
      database.recordRun({
        id: runId,
        timestamp: new Date().toISOString(),
        trigger_type: triggerType,
        total_found: total,
        new_found: status === 'failed' ? 0 : newCount,
        duration_ms: Date.now() - startTime,
        status,
        sources: sourceResults,
      });
    } finally {
      database.db.prepare('DELETE FROM pipeline_lock WHERE owner = ?').run(runId);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runScraperPipeline('cli_manual')
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
      if (result.status !== 'success') process.exitCode = 1;
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
