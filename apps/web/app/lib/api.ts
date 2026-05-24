const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// Rooms
export function createRoom(playerName: string, token?: string, avatarId?: string | null) {
  return req<{ code: string; playerId: string }>('/rooms', {
    method: 'POST',
    body: JSON.stringify({ playerName, avatarId: avatarId ?? null }),
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
}

export function joinRoom(code: string, playerName: string, token?: string, avatarId?: string | null) {
  return req<{ playerId: string }>(`/rooms/${code}/join`, {
    method: 'POST',
    body: JSON.stringify({ playerName, avatarId: avatarId ?? null }),
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
}

export function getMe(token: string) {
  return req<{ userId: string; email: string | null }>('/me', {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function setAvatar(avatarId: string, token: string) {
  return req<{ ok: boolean }>('/me/avatar', {
    method: 'POST',
    body: JSON.stringify({ avatarId }),
    headers: { Authorization: `Bearer ${token}` },
  });
}

export interface RoomState {
  code: string;
  status: 'waiting' | 'ready' | 'in_battle' | 'finished';
  players: { name: string; ready: boolean; avatarId: string | null }[];
}

export function getRoomState(code: string) {
  return req<RoomState>(`/rooms/${code}`);
}

export function submitTeam(
  code: string,
  playerId: string,
  team: { pokemonId: string; moveIds: string[] }[],
) {
  return req<{ ok: boolean }>(`/rooms/${code}/team`, {
    method: 'POST',
    body: JSON.stringify({ playerId, team }),
  });
}

export function startBattle(code: string) {
  return req<{ code: string }>(`/rooms/${code}/start`, { method: 'POST' });
}

// Catalog
export interface PokemonSummary {
  _id: string;
  pokedexId: number;
  name: string;
  types: string[];
  baseStats: Record<string, number>;
  spriteFrontUrl: string;
  isLegendary: boolean;
}

export interface PokemonDetail extends PokemonSummary {
  damagingMoveIds: string[];
  statusMoveIds: string[];
  moves: MoveDetail[];
}

export interface MoveDetail {
  moveId: string;
  name: string;
  type: string;
  power: number | null;
  accuracy: number | null;
  priority: number;
  damageClass: 'physical' | 'special' | 'status';
  appliesStatus?: string;
}

export function getCatalog(params: { name?: string; type?: string; page?: number; limit?: number } = {}) {
  const q = new URLSearchParams();
  if (params.name) q.set('name', params.name);
  if (params.type) q.set('type', params.type);
  if (params.page) q.set('page', String(params.page));
  if (params.limit) q.set('limit', String(params.limit));
  return req<{ pokemon: PokemonSummary[]; total: number; page: number; limit: number }>(
    `/catalog/pokemon?${q}`,
  );
}

export function getPokemonDetail(id: string) {
  return req<PokemonDetail>(`/catalog/pokemon/${id}`);
}

// Battle
export function sendAction(
  code: string,
  playerId: string,
  action: { type: 'move'; moveId: string } | { type: 'switch'; switchToIndex: number },
) {
  return req<{ status: 'waiting' | 'resolved'; state?: unknown }>(`/battle/${code}/action`, {
    method: 'POST',
    body: JSON.stringify({ playerId, ...action }),
  });
}
