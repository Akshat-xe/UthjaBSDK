function hasTerm(text, term) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`, 'i').test(text);
}

export const tierEngine = {
  // User's current core competencies and quick-learn skills
  USER_PROFILE: {
    primary: [
      'html',
      'css',
      'ai-assisted development',
      'vibe coding',
      'prompt engineering',
      'automation',
      'low-code',
      'web app',
      'prototype',
      'ui/ux',
    ],
    quickLearn: [
      'javascript',
      'js',
      'node',
      'python',
      'sqlite',
      'typescript',
      'api',
      'machine learning',
      'model training',
    ],
    interests: ['web', 'ai', 'automation', 'productivity', 'tools'],
  },

  FLAGSHIP_ORGANIZERS: [
    'google',
    'microsoft',
    'major league hacking',
    'mlh',
    'smart india hackathon',
    'sih',
    'ethglobal',
    'devfolio',
    'iit',
    'nit',
    'iiit',
    'bits',
    'hackerrank',
    'github',
    'amazon',
    'flipkart',
  ],

  calculateSkillMatch(skills = [], description = '') {
    const text = (skills.join(' ') + ' ' + description).toLowerCase();
    let score = 0;
    let matchedSkills = [];

    for (const skill of this.USER_PROFILE.primary) {
      if (hasTerm(text, skill)) {
        score += 0.25;
        matchedSkills.push(skill);
      }
    }

    for (const skill of this.USER_PROFILE.quickLearn) {
      if (hasTerm(text, skill)) {
        score += 0.15;
        matchedSkills.push(`${skill} (quick-learn)`);
      }
    }

    const mlHeavy = [
      'machine learning',
      'deep learning',
      'model training',
      'neural network',
      'pytorch',
      'tensorflow',
      'computer vision',
    ].some((term) => hasTerm(text, term));
    score = Math.min(score, 1);
    if (mlHeavy) score *= 0.35;
    return {
      mlHeavy,
      score: Math.min(Math.round(score * 100) / 100, 1.0),
      matchedSkills: [...new Set(matchedSkills)],
    };
  },

  calculateTier(event, attendanceEval) {
    const organizer = (event.organizer || '').toLowerCase();
    const title = (event.title || '').toLowerCase();
    const prize = (event.prize_pool || '').toLowerCase();

    const isFlagship = this.FLAGSHIP_ORGANIZERS.some((f) => hasTerm(organizer, f));
    const isBigPrize = /(?:[$₹]\s*[1-9][\d,]*|[1-9][\d,.]*\s*(?:usd|inr|lakh|crore)\b)/i.test(
      prize,
    );
    const isWeekend = attendanceEval.isWeekend;
    const isAttendanceSafe = attendanceEval.attendance_safe;
    const skillScore = event.skill_match_score || 0;

    if (attendanceEval.attendance_safe === false) {
      return { tier: 'Tier C', reason: 'Known attendance conflict. Resolve it before committing.' };
    }
    if (attendanceEval.attendance_safe == null) {
      return {
        tier: 'Tier B',
        reason: `${isFlagship ? 'Recognized organizer keyword; not independently verified. ' : ''}Schedule unverified. ${skillScore > 0 ? 'Some skill alignment.' : 'Skill fit needs review.'}`,
      };
    }

    // 1. Tier S: Flagship National/International Major or Massive Recognition
    if (
      isFlagship &&
      (skillScore >= 0.2 || title.includes('hackathon') || title.includes('challenge'))
    ) {
      return {
        tier: 'Tier S',
        reason:
          'Recognized organizer keyword and skill alignment; verify organizer and eligibility.',
      };
    }

    // 2. Tier A: High Value, Weekend-Friendly or Great Prize Pool
    if ((isWeekend || isAttendanceSafe) && (isBigPrize || skillScore >= 0.5)) {
      return {
        tier: 'Tier A',
        reason:
          'High value event, compatible with college schedule and matches JavaScript/Web skills.',
      };
    }

    // 3. Tier B: Solid Practice / Regional
    if (isAttendanceSafe && (skillScore > 0 || isWeekend)) {
      return {
        tier: 'Tier B',
        reason: 'Good weekend practice opportunity to build projects and portfolio.',
      };
    }

    // 4. Tier C / Fluff: Clashes with 75% attendance or low relevance
    return {
      tier: 'Tier C',
      reason: !isAttendanceSafe
        ? 'Requires weekday leaves that threaten 75% college attendance.'
        : 'Low skill alignment or unverified organizer.',
    };
  },
};
