export const TYPE_COLORS: Record<string, string> = {
  normal:   '#a8a878',
  fire:     '#e45a3a',
  water:    '#4a82c9',
  electric: '#e8b734',
  grass:    '#67b04c',
  ice:      '#82c4d6',
  fighting: '#c8604a',
  poison:   '#8c5cb4',
  ground:   '#a07845',
  flying:   '#8498c8',
  psychic:  '#d268a8',
  bug:      '#7a9a30',
  rock:     '#b09060',
  ghost:    '#5a4878',
  dragon:   '#7038f8',
  dark:     '#4a3a48',
  steel:    '#94a0ad',
  fairy:    '#e090b8',
};

export const TYPE_LIST = Object.keys(TYPE_COLORS);

export function typeColor(type: string): string {
  return TYPE_COLORS[type] ?? '#a8a878';
}
