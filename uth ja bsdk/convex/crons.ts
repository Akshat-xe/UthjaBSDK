import { cronJobs } from 'convex/server';
import { internal } from './_generated/api';

const crons = cronJobs();
crons.interval('refresh public Unstop hackathons', { hours: 12 }, internal.radarCloud.refresh);
export default crons;
