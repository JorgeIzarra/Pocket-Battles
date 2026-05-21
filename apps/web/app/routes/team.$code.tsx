import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { getCatalog, submitTeam, startBattle, getRoomState, type PokemonSummary, type MoveDetail, getPokemonDetail } from '../lib/api';
import { TypeBadge, PixelFrame, CreatureCard, TitleBar } from '../components/shared';
import { TYPE_LIST, typeColor } from '../lib/types';

export const Route = createFileRoute('/team/$code')({
  component: TeamSelectScreen,
});

const MAX_TEAM = 6;

interface TeamEntry {
  pokemon: PokemonSummary;
  moveIds: string[];
  availableMoves: MoveDetail[];
}

function TeamSelectScreen() {
  const { code } = Route.useParams();
  const navigate = useNavigate();

  const session = (() => {
    try { return JSON.parse(sessionStorage.getItem(`pb:${code}`) ?? '{}'); } catch { return {}; }
  })();
  const playerName: string = session.name ?? '?';
  const playerId: string = session.playerId ?? '';

  const [catalog, setCatalog] = useState<PokemonSummary[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [team, setTeam] = useState<TeamEntry[]>([]);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load full catalog (paginate until done)
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const all: PokemonSummary[] = [];
      let page = 1;
      while (true) {
        const res = await getCatalog({ page, limit: 100 });
        all.push(...res.pokemon);
        if (all.length >= res.total) break;
        page++;
      }
      if (!cancelled) { setCatalog(all); setCatalogLoading(false); }
    }
    load().catch(() => setCatalogLoading(false));
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return catalog.filter(c => {
      if (q && !c.name.toLowerCase().includes(q)) return false;
      if (filterType && !c.types.includes(filterType)) return false;
      return true;
    });
  }, [catalog, search, filterType]);

  const activeEntry = activeIdx >= 0 ? team[activeIdx] : null;

  async function addPokemon(p: PokemonSummary) {
    if (team.some(t => t.pokemon._id === p._id)) return;
    if (team.length >= MAX_TEAM) return;
    const detail = await getPokemonDetail(p._id);
    const availableMoves = detail.moves;
    const newTeam = [...team, { pokemon: p, moveIds: [], availableMoves }];
    setTeam(newTeam);
    setActiveIdx(newTeam.length - 1);
  }

  function removeFromTeam(idx: number) {
    const next = team.filter((_, i) => i !== idx);
    setTeam(next);
    if (activeIdx === idx) setActiveIdx(-1);
    else if (activeIdx > idx) setActiveIdx(activeIdx - 1);
  }

  function toggleMove(moveId: string) {
    if (!activeEntry) return;
    const has = activeEntry.moveIds.includes(moveId);
    let nextMoves: string[];
    if (has) nextMoves = activeEntry.moveIds.filter(m => m !== moveId);
    else if (activeEntry.moveIds.length >= 4) return;
    else nextMoves = [...activeEntry.moveIds, moveId];
    setTeam(team.map((t, i) => i === activeIdx ? { ...t, moveIds: nextMoves } : t));
  }

  const teamValid = team.length >= 1 && team.every(e => e.moveIds.length === 4);

  async function handleReady() {
    if (!teamValid || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await submitTeam(code, playerId, team.map(e => ({ pokemonId: e.pokemon._id, moveIds: e.moveIds })));

      // Try to start battle immediately (succeeds if rival already submitted)
      let started = false;
      try {
        await startBattle(code);
        started = true;
      } catch {
        // Rival hasn't submitted yet — wait for them
      }

      if (!started) {
        // Poll room state until the rival triggers startBattle and the battle exists
        let attempts = 0;
        while (attempts < 60) {
          await new Promise(r => setTimeout(r, 1500));
          const room = await getRoomState(code);
          if (room.status === 'in_battle') break;
          attempts++;
        }
      }

      navigate({ to: '/battle/$code', params: { code } });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al enviar el equipo');
      setSubmitting(false);
    }
  }

  return (
    <>
      <TitleBar step={3} />
      <div className="screen" data-screen-label="03 Seleccion de equipo">
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 326px', gridTemplateRows: 'auto 1fr auto', gap: 12, padding: '14px 18px 18px', minHeight: 0 }}>
          {/* HEADER */}
          <div style={{ gridColumn: '1 / -1' }} className="row">
            <div style={{ flex: 1 }}>
              <div className="pixel-label" style={{ color: 'var(--accent)' }}>PASO 1 DE 2 · ANTES DE LA BATALLA</div>
              <h2 style={{ margin: '2px 0 0', fontFamily: 'var(--font-label)', fontSize: 22, letterSpacing: 0.6, color: 'var(--ink)' }}>
                Arma tu equipo, {playerName.toUpperCase()}
              </h2>
            </div>
            <div className="row gap-8" style={{ minWidth: 0 }}>
              <input
                className="pinput"
                placeholder="Buscar criatura…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ width: 200, fontSize: 16, padding: '7px 12px' }}
              />
              <TypeFilter value={filterType} onChange={setFilterType} open={filterOpen} setOpen={setFilterOpen} />
              <button className="btn btn--ghost btn--sm" onClick={() => navigate({ to: '/lobby/$code', params: { code } })}>← LOBBY</button>
            </div>
          </div>

          {/* LEFT — roster grid */}
          <PixelFrame style={{ padding: 8, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {catalogLoading ? (
              <div style={{ margin: 'auto', fontFamily: 'var(--font-body)', fontSize: 20, color: 'var(--ink-mute)' }}>Cargando catálogo…</div>
            ) : (
              <div className="scroll-box" style={{ flex: 1, padding: 4, minHeight: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gridAutoRows: 'min-content', gap: 10 }}>
                {filtered.length === 0 ? (
                  <div style={{ gridColumn: '1 / -1', padding: 40, textAlign: 'center', fontFamily: 'var(--font-body)', fontSize: 20, color: 'var(--ink-mute)' }}>
                    No hay criaturas con esos filtros.
                  </div>
                ) : filtered.map(c => {
                  const inTeam = team.some(t => t.pokemon._id === c._id);
                  return (
                    <CreatureCard
                      key={c._id}
                      creature={c}
                      selected={inTeam}
                      disabled={!inTeam && team.length >= MAX_TEAM}
                      onClick={() => {
                        if (inTeam) {
                          const idx = team.findIndex(t => t.pokemon._id === c._id);
                          setActiveIdx(idx);
                        } else {
                          addPokemon(c);
                        }
                      }}
                    />
                  );
                })}
              </div>
            )}
          </PixelFrame>

          {/* RIGHT — team + moves */}
          <div style={{ display: 'grid', gridTemplateRows: 'auto 1fr', gap: 12, minHeight: 0 }}>
            {/* Team slots */}
            <PixelFrame style={{ padding: 10 }}>
              <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
                <span className="pixel-label">EQUIPO</span>
                <span className="pixel-label" style={{ color: team.length === MAX_TEAM ? 'var(--good)' : 'var(--ink-soft)' }}>
                  {team.length} / {MAX_TEAM}
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                {Array.from({ length: MAX_TEAM }).map((_, i) => {
                  const entry = team[i];
                  const isActive = activeIdx === i;
                  const movesComplete = entry && entry.moveIds.length === 4;
                  return (
                    <button
                      key={i}
                      onClick={() => entry ? setActiveIdx(i) : undefined}
                      disabled={!entry}
                      style={{
                        position: 'relative', height: 86,
                        background: entry ? (isActive ? 'var(--hl)' : 'var(--surface)') : 'var(--surface-sunk)',
                        border: `3px ${entry ? 'solid' : 'dashed'} ${isActive ? 'var(--accent)' : 'var(--line)'}`,
                        borderRadius: 8,
                        boxShadow: entry ? 'inset 0 0 0 2px var(--surface), 0 2px 0 var(--shadow)' : 'none',
                        cursor: entry ? 'pointer' : 'default',
                        padding: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                      }}
                    >
                      {entry ? (
                        <>
                          <img src={entry.pokemon.spriteFrontUrl} alt={entry.pokemon.name} width={48} height={48} style={{ imageRendering: 'pixelated', objectFit: 'contain' }} />
                          <span style={{ fontFamily: 'var(--font-label)', fontSize: 9, letterSpacing: 0.4, color: 'var(--ink)' }}>{entry.pokemon.name}</span>
                          <span style={{ position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: '50%', background: movesComplete ? 'var(--good)' : 'var(--warn)', color: '#fff', fontFamily: 'var(--font-label)', fontSize: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid var(--line)' }}>
                            {movesComplete ? '✓' : '!'}
                          </span>
                          <span
                            onClick={(e) => { e.stopPropagation(); removeFromTeam(i); }}
                            style={{ position: 'absolute', top: -6, left: -6, width: 18, height: 18, borderRadius: '50%', background: 'var(--surface)', color: 'var(--bad)', fontFamily: 'var(--font-label)', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid var(--line)', cursor: 'pointer' }}
                          >×</span>
                        </>
                      ) : (
                        <span style={{ margin: 'auto', fontFamily: 'var(--font-label)', fontSize: 11, color: 'var(--ink-mute)' }}>SLOT {i + 1}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </PixelFrame>

            {/* Moves picker */}
            <PixelFrame style={{ padding: 10, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              {activeEntry ? (
                <>
                  <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
                    <div className="row gap-8">
                      <span className="pixel-label">MOVIMIENTOS</span>
                      <span style={{ fontFamily: 'var(--font-label)', fontSize: 11, color: 'var(--ink)' }}>{activeEntry.pokemon.name}</span>
                    </div>
                    <span className="pixel-label" style={{ color: activeEntry.moveIds.length === 4 ? 'var(--good)' : 'var(--ink-soft)' }}>
                      {activeEntry.moveIds.length} / 4
                    </span>
                  </div>
                  <div className="scroll-box" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 5, paddingRight: 4 }}>
                    {activeEntry.availableMoves.map(m => {
                      const picked = activeEntry.moveIds.includes(m.moveId);
                      const disabled = !picked && activeEntry.moveIds.length >= 4;
                      return (
                        <button
                          key={m.moveId}
                          onClick={() => toggleMove(m.moveId)}
                          disabled={disabled}
                          style={{
                            display: 'grid', gridTemplateColumns: 'auto 1fr auto auto',
                            gap: 8, alignItems: 'center', padding: '6px 10px',
                            background: picked ? 'var(--hl)' : 'var(--surface)',
                            border: `3px solid ${picked ? 'var(--accent)' : 'var(--line)'}`,
                            borderRadius: 8, cursor: disabled ? 'not-allowed' : 'pointer',
                            opacity: disabled ? 0.45 : 1,
                            fontFamily: 'var(--font-body)', color: 'var(--ink)',
                            textAlign: 'left', boxShadow: '0 2px 0 var(--shadow)',
                          }}
                        >
                          <span style={{ width: 16, height: 16, borderRadius: 3, background: typeColor(m.type), border: '2px solid var(--line)', display: 'inline-block' }} />
                          <span style={{ fontFamily: 'var(--font-label)', fontSize: 11, letterSpacing: 0.4 }}>{m.name}</span>
                          <span style={{ fontFamily: 'var(--font-label)', fontSize: 9, color: 'var(--ink-mute)' }}>{m.damageClass.toUpperCase()}</span>
                          <span style={{ fontFamily: 'var(--font-label)', fontSize: 10, color: 'var(--ink-soft)' }}>POW {m.power ?? '—'}</span>
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div style={{ margin: 'auto', textAlign: 'center', fontFamily: 'var(--font-body)', fontSize: 18, color: 'var(--ink-mute)', padding: 30 }}>
                  Selecciona una criatura del equipo<br />para elegir sus 4 movimientos.
                </div>
              )}
            </PixelFrame>
          </div>

          {/* FOOTER */}
          <div style={{ gridColumn: '1 / -1' }} className="row">
            <PixelFrame variant="sunk" style={{ flex: 1, padding: '8px 14px' }}>
              <div className="row gap-12">
                <span className="pixel-label" style={{ color: teamValid ? 'var(--good)' : 'var(--warn)' }}>
                  {teamValid ? '● EQUIPO LISTO' : '● FALTAN MOVIMIENTOS'}
                </span>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: 17, color: 'var(--ink-soft)' }}>
                  {teamValid ? 'Tu equipo está completo. Pulsa LISTO para empezar.' : 'Cada criatura debe tener 4 movimientos seleccionados.'}
                </span>
              </div>
              {error && <div style={{ marginTop: 4, color: 'var(--bad)', fontFamily: 'var(--font-body)', fontSize: 16 }}>⚠ {error}</div>}
            </PixelFrame>
            <button className="btn btn--primary btn--lg" disabled={!teamValid || submitting} onClick={handleReady}>
              {submitting ? 'ENVIANDO…' : 'LISTO ▶'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function TypeFilter({ value, onChange, open, setOpen }: { value: string | null; onChange: (t: string | null) => void; open: boolean; setOpen: (o: boolean) => void }) {
  return (
    <div style={{ position: 'relative' }}>
      <button className="btn btn--sm" onClick={() => setOpen(!open)} style={{ minWidth: 130 }}>
        {value ? <TypeBadge type={value} size="sm" /> : 'TIPO ▾'}
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 10, padding: 8, background: 'var(--surface)', border: '3px solid var(--line)', borderRadius: 10, boxShadow: '0 4px 0 var(--shadow)', width: 200, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
          <button className="btn btn--sm" onClick={() => { onChange(null); setOpen(false); }} style={{ gridColumn: '1 / -1' }}>TODOS</button>
          {TYPE_LIST.map(t => (
            <button
              key={t}
              onClick={() => { onChange(t); setOpen(false); }}
              style={{ background: typeColor(t), color: '#fff', border: '2px solid var(--line)', borderRadius: 5, padding: '4px 0', cursor: 'pointer', fontFamily: 'var(--font-label)', fontSize: 9, letterSpacing: 0.5, textShadow: '1px 1px 0 rgba(0,0,0,0.4)' }}
            >
              {t}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
