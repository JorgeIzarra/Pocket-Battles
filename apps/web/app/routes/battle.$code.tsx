import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useBattleState, type BattlePokemon, type PlayerState } from '../hooks/useBattleState';
import { sendAction } from '../lib/api';
import { BattleLog, CreatureSprite, HealthBar, HPBox, MoveButton, PixelFrame, Platform, TitleBar, TypeBadge } from '../components/shared';
import { typeColor } from '../lib/types';

export const Route = createFileRoute('/battle/$code')({
  component: BattleScreen,
});

const BG = {
  sky: 'linear-gradient(180deg, #b9e0f0 0%, #d8eed3 60%, #c5b889 100%)',
  floor: '#9bbf6f',
  platformColor: 'var(--t-grass)',
};

function BattleScreen() {
  const { code } = Route.useParams();
  const navigate = useNavigate();
  const { state, error } = useBattleState(code);

  const session = (() => {
    try { return JSON.parse(sessionStorage.getItem(`pb:${code}`) ?? '{}'); } catch { return {}; }
  })();
  const playerId: string = session.playerId ?? '';

  const [phase, setPhase] = useState<'choose' | 'waiting' | 'switch'>('choose');
  const [actionError, setActionError] = useState<string | null>(null);

  if (error) {
    return (
      <>
        <TitleBar step={4} />
        <div className="screen" style={{ alignItems: 'center', justifyContent: 'center' }}>
          <PixelFrame style={{ padding: 32, textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--font-label)', color: 'var(--bad)', fontSize: 18 }}>⚠ {error}</div>
            <button className="btn btn--primary" style={{ marginTop: 16 }} onClick={() => navigate({ to: '/' })}>VOLVER AL INICIO</button>
          </PixelFrame>
        </div>
      </>
    );
  }

  if (!state) {
    return (
      <>
        <TitleBar step={4} />
        <div className="screen" style={{ alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 24, color: 'var(--ink-mute)' }}>Conectando con la batalla…</div>
        </div>
      </>
    );
  }

  // Determine which player state belongs to us
  const myPlayerState: PlayerState = state.players[0].playerId === playerId ? state.players[0] : state.players[1];
  const oppPlayerState: PlayerState = state.players[0].playerId === playerId ? state.players[1] : state.players[0];

  const myActive: BattlePokemon = myPlayerState.team[myPlayerState.activeIndex];
  const oppActive: BattlePokemon = oppPlayerState.team[oppPlayerState.activeIndex];

  // Reset phase to 'choose' when state updates from SSE (turn resolved)
  // We track this via the turn number
  const [lastTurn, setLastTurn] = useState(state.turn);
  if (state.turn !== lastTurn) {
    setLastTurn(state.turn);
    setPhase('choose');
  }

  async function handleMove(moveId: string) {
    if (phase !== 'choose') return;
    setPhase('waiting');
    setActionError(null);
    try {
      const result = await sendAction(code, playerId, { type: 'move', moveId });
      if (result.status === 'resolved') {
        // State will update via SSE, phase reset there
      }
      // If 'waiting', stay in waiting phase until SSE pushes new state
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Error');
      setPhase('choose');
    }
  }

  async function handleSwitch(idx: number) {
    if (phase !== 'choose' && phase !== 'switch') return;
    setPhase('waiting');
    setActionError(null);
    try {
      await sendAction(code, playerId, { type: 'switch', switchToIndex: idx });
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Error');
      setPhase('choose');
    }
  }

  const alive = myPlayerState.team.filter(p => p.currentHp > 0);
  const canSwitch = alive.length > 1;

  return (
    <>
      <TitleBar step={4} />
      <div className="screen" data-screen-label="04 Batalla">
        <div style={{ flex: 1, display: 'grid', gridTemplateRows: '1fr 280px', gap: 0 }}>
          {/* STAGE */}
          <div style={{ position: 'relative', overflow: 'hidden', background: BG.sky, borderBottom: '4px solid var(--line)' }}>
            {/* Floor */}
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '44%', background: BG.floor, opacity: 0.85 }} />
            {/* Scanline */}
            <div style={{ position: 'absolute', inset: 0, backgroundImage: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.04) 0 2px, transparent 2px 4px)', pointerEvents: 'none', mixBlendMode: 'multiply' }} />

            {/* OPPONENT HP box — top left */}
            <div style={{ position: 'absolute', top: 26, left: 32 }}>
              <HPBox pokemon={oppActive} />
            </div>

            {/* OPPONENT sprite — top right */}
            <div style={{ position: 'absolute', top: 70, right: 110, width: 200, height: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
              <Platform width={220} color={BG.platformColor} style={{ right: -10 }} />
              <div style={{ position: 'relative', zIndex: 2 }}>
                <CreatureSprite spriteUrl={oppActive.spriteUrl} name={oppActive.name} size={170} facing="front" />
              </div>
            </div>

            {/* PLAYER sprite — bottom left */}
            <div style={{ position: 'absolute', bottom: 28, left: 90, width: 240, height: 220, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
              <Platform width={260} color={BG.platformColor} style={{ left: -10 }} />
              <div style={{ position: 'relative', zIndex: 2 }}>
                <CreatureSprite spriteUrl={myActive.spriteUrl} name={myActive.name} size={200} facing="back" />
              </div>
            </div>

            {/* PLAYER HP box — bottom right */}
            <div style={{ position: 'absolute', bottom: 22, right: 32 }}>
              <HPBox pokemon={myActive} showNumbers />
            </div>

            {/* Name tags */}
            <NameTag label={`${oppPlayerState.name.toUpperCase()} · RIVAL`} style={{ position: 'absolute', top: 8, right: 16 }} color="var(--accent-2)" />
            <NameTag label={`${myPlayerState.name.toUpperCase()} · TÚ`} style={{ position: 'absolute', bottom: 6, left: 16 }} color="var(--accent)" />

            {/* Team dots */}
            <TeamDots team={oppPlayerState.team} style={{ position: 'absolute', top: 32, right: 16 }} label="RIVAL" />
            <TeamDots team={myPlayerState.team} style={{ position: 'absolute', bottom: 6, right: 120 }} label="EQUIPO" />

            {/* End overlay */}
            {state.status === 'finished' && (
              <EndOverlay
                won={state.winnerPlayerId === playerId}
                myName={myPlayerState.name}
                oppName={oppPlayerState.name}
                onExit={() => navigate({ to: '/' })}
              />
            )}
          </div>

          {/* BOTTOM PANEL */}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 480px', gap: 10, padding: 10, background: 'var(--bg-deep)' }}>
            {/* LOG */}
            <PixelFrame style={{ overflow: 'hidden', minHeight: 0 }}>
              <BattleLog lines={state.battleLog} />
            </PixelFrame>

            {/* ACTIONS */}
            <PixelFrame style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0 }}>
              {actionError && (
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--bad)' }}>⚠ {actionError}</div>
              )}
              {phase === 'switch' ? (
                <SwitchPanel
                  team={myPlayerState.team}
                  active={myPlayerState.activeIndex}
                  onPick={handleSwitch}
                  onCancel={() => setPhase('choose')}
                />
              ) : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', gap: 8, flex: 1, minHeight: 0 }}>
                    {[0, 1, 2, 3].map(i => (
                      <MoveButton
                        key={i}
                        move={myActive.moves[i]}
                        disabled={phase !== 'choose' || state.status === 'finished'}
                        onClick={() => myActive.moves[i] && handleMove(myActive.moves[i].moveId)}
                      />
                    ))}
                  </div>
                  <div className="row gap-8">
                    {phase === 'waiting' && (
                      <span style={{ fontFamily: 'var(--font-body)', fontSize: 16, color: 'var(--ink-mute)' }}>Esperando al rival…</span>
                    )}
                    <button className="btn btn--block" onClick={() => setPhase('switch')} disabled={phase !== 'choose' || !canSwitch || state.status === 'finished'}>
                      ⇄ CAMBIAR
                    </button>
                    <button className="btn btn--block" onClick={() => navigate({ to: '/' })} disabled={state.status !== 'finished'}>
                      ✕ SALIR
                    </button>
                  </div>
                </>
              )}
            </PixelFrame>
          </div>
        </div>
      </div>
    </>
  );
}

function NameTag({ label, color, style }: { label: string; color: string; style: React.CSSProperties }) {
  return (
    <span style={{ fontFamily: 'var(--font-label)', fontSize: 10, letterSpacing: 1, color: '#fff', background: color, padding: '3px 8px 2px', border: '2px solid var(--line)', borderRadius: 6, textShadow: '1px 1px 0 rgba(0,0,0,0.4)', ...style }}>
      {label}
    </span>
  );
}

function TeamDots({ team, style, label }: { team: BattlePokemon[]; style: React.CSSProperties; label: string }) {
  return (
    <div className="row gap-4" style={{ padding: '3px 7px', background: 'rgba(0,0,0,0.45)', border: '2px solid var(--line)', borderRadius: 8, ...style }}>
      <span style={{ fontFamily: 'var(--font-label)', fontSize: 9, color: '#f3e6c4', letterSpacing: 0.5 }}>{label}</span>
      {team.map((p, i) => (
        <span key={i} style={{ width: 10, height: 10, borderRadius: '50%', background: p.currentHp > 0 ? 'var(--good)' : 'var(--bad)', border: '1px solid var(--line)', opacity: p.currentHp > 0 ? 1 : 0.5, display: 'inline-block' }} />
      ))}
    </div>
  );
}

function SwitchPanel({ team, active, onPick, onCancel }: { team: BattlePokemon[]; active: number; onPick: (i: number) => void; onCancel: () => void }) {
  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="pixel-label">CAMBIAR CRIATURA</span>
        <button className="btn btn--sm btn--ghost" onClick={onCancel}>← VOLVER</button>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {team.map((p, i) => {
          const fainted = p.currentHp <= 0;
          const isActive = i === active;
          return (
            <button
              key={i}
              onClick={() => onPick(i)}
              disabled={isActive || fainted}
              style={{ position: 'relative', display: 'grid', gridTemplateColumns: '44px 1fr', gap: 6, alignItems: 'center', padding: 6, background: isActive ? 'var(--hl)' : fainted ? 'var(--surface-sunk)' : 'var(--surface)', border: `3px solid ${isActive ? 'var(--accent)' : 'var(--line)'}`, borderRadius: 8, cursor: (isActive || fainted) ? 'not-allowed' : 'pointer', opacity: fainted ? 0.5 : 1, textAlign: 'left', fontFamily: 'var(--font-body)', color: 'var(--ink)' }}
            >
              <div style={{ background: 'var(--surface-sunk)', borderRadius: 6, border: '2px solid var(--line-soft)', padding: 2, display: 'flex', justifyContent: 'center', alignItems: 'center', width: 44, height: 44 }}>
                <CreatureSprite spriteUrl={p.spriteUrl} name={p.name} size={36} />
              </div>
              <div className="col gap-4">
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span style={{ fontFamily: 'var(--font-label)', fontSize: 10 }}>{p.name}</span>
                  <span style={{ fontFamily: 'var(--font-label)', fontSize: 9, color: 'var(--ink-mute)' }}>Lv{p.level}</span>
                </div>
                <HealthBar current={p.currentHp} max={p.maxHp} />
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <div className="row gap-4">{p.types.map(t => <TypeBadge key={t} type={t} size="sm" />)}</div>
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: fainted ? 'var(--bad)' : 'var(--ink)' }}>
                    {fainted ? 'DEBILITADO' : `${p.currentHp}/${p.maxHp}`}
                  </span>
                </div>
              </div>
              {isActive && (
                <span style={{ position: 'absolute', top: -8, right: -8, fontFamily: 'var(--font-label)', fontSize: 9, background: 'var(--accent)', color: '#fff', padding: '2px 5px', border: '2px solid var(--line)', borderRadius: 5 }}>EN COMBATE</span>
              )}
            </button>
          );
        })}
      </div>
    </>
  );
}

function EndOverlay({ won, myName, oppName, onExit }: { won: boolean; myName: string; oppName: string; onExit: () => void }) {
  return (
    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, animation: 'dialogIn 320ms ease-out' }}>
      <PixelFrame style={{ padding: 32, minWidth: 460, textAlign: 'center', background: won ? 'var(--surface)' : 'var(--surface-sunk)' }}>
        <div className="pixel-label" style={{ color: won ? 'var(--good)' : 'var(--bad)' }}>
          {won ? 'VICTORIA' : 'DERROTA'}
        </div>
        <h2 style={{ margin: '10px 0 8px', fontFamily: 'var(--font-label)', fontSize: 38, letterSpacing: 1.5, color: won ? 'var(--good)' : 'var(--bad)', textShadow: '3px 3px 0 var(--line-soft)' }}>
          {won ? '¡GANASTE!' : '¡PERDISTE!'}
        </h2>
        <p style={{ margin: '0 0 16px', fontFamily: 'var(--font-body)', fontSize: 20, color: 'var(--ink-soft)' }}>
          {won
            ? <>Has derrotado a <b>{oppName.toUpperCase()}</b>. ¡Gran combate, {myName.toUpperCase()}!</>
            : <><b>{oppName.toUpperCase()}</b> se llevó esta. ¡Otra vez será!</>
          }
        </p>
        <div className="row gap-12" style={{ justifyContent: 'center' }}>
          <button className="btn btn--primary btn--lg" onClick={onExit}>VOLVER AL INICIO</button>
        </div>
      </PixelFrame>
    </div>
  );
}
