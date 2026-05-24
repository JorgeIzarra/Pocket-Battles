export const VALID_AVATARS = [
  'red', 'blue', 'cynthia', 'giovanni',
  'iris', 'n', 'brock', 'youngster',
] as const;

export type AvatarId = typeof VALID_AVATARS[number];
