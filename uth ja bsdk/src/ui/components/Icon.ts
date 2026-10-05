import { ICONS } from './icon-data.js';

type IconProps = {
  name: `ph:${string}`;
  size?: number;
  className?: string;
};

// The app renders HTML strings, so this wrapper returns the same Iconify SVG markup
// that a JSX Icon component would render without introducing a second UI runtime.
export function Icon({ name, size = 24, className = 'text-current' }: IconProps): string {
  const body = ICONS[name];
  if (!body) throw new Error(`Unknown icon: ${name}`);
  const safeSize = Number.isFinite(size) ? Math.max(1, Math.min(size, 64)) : 24;
  const safeClasses = className.replace(/[^a-zA-Z0-9_\s:-]/g, '');
  return `<svg class="${safeClasses}" width="${safeSize}" height="${safeSize}" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true" focusable="false">${body}</svg>`;
}
