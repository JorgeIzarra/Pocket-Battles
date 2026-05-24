import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { useBattleState, type BattlePokemon, type BattleState, type PlayerState, type LogEntry, type TurnData } from '../hooks/useBattleState';
import { sendAction } from '../lib/api';
import { BattleLog, CreatureSprite, HealthBar, HPBox, MoveButton, PixelFrame, Platform, TitleBar, TypeBadge } from '../components/shared';

export const Route = createFileRoute('/battle/$code')({
  component: BattleScreen,
});

const BG = {
  sky: 'linear-gradient(180deg, #b9e0f0 0%, #d8eed3 60%, #c5b889 100%)',
  floor: '#9bbf6f',
  platformColor: 'var(--t-grass)',
};

// ---------- AnimFrame -------------------------------------------------------

interface AnimFrame {
  logLines: LogEntry[];
  hpUpdate?: { pokemonId: string; hp: number };
  activeIndexUpdate?: { playerIdx: number; index: number };
  myAnim: string;
  oppAnim: string;
  waitMs: number;
}

function applyHpUpdate(state: BattleState, pokemonId: string, hp: number): BattleState {
  return {
    ...state,
    players: state.players.map(player => ({
      ...player,
      team: player.team.map(pk =>
        pk.pokemonId === pokemonId ? { ...pk, currentHp: hp } : pk
      ),
    })) as [PlayerState, PlayerState],
  };
}

function applyActiveIndex(state: BattleState, playerIdx: number, index: number): BattleState {
  return {
    ...state,
    players: state.players.map((p, i) =>
      i === playerIdx ? { ...p, activeIndex: index } : p
    ) as [PlayerState, PlayerState],
  };
}

function buildAnimFrames(
  turnLog: LogEntry[],
  myPokemonIds: Set<string>,
  finalState: BattleState,
): AnimFrame[] {
  const frames: AnimFrame[] = [];
  let i = 0;

  while (i < turnLog.length) {
    const entry = turnLog[i];

    if (entry.actorId && entry.targetId !== undefined && entry.targetHpAfter !== undefined) {
      // Damaging attack hit
      const isMyAttack = myPokemonIds.has(entry.actorId);

      const modifiers: LogEntry[] = [];
      let j = i + 1;
      while (j < turnLog.length && !turnLog[j].actorId && turnLog[j].targetId === undefined) {
        modifiers.push(turnLog[j]);
        j++;
      }

      frames.push({
        logLines: [entry],
        myAnim: isMyAttack ? 'attack-r' : '',
        oppAnim: isMyAttack ? '' : 'attack-l',
        waitMs: 480,
      });
      frames.push({
        logLines: modifiers,
        hpUpdate: { pokemonId: entry.targetId, hp: entry.targetHpAfter },
        myAnim: isMyAttack ? '' : 'shake flash',
        oppAnim: isMyAttack ? 'shake flash' : '',
        waitMs: 620,
      });
      i = j;

    } else if (entry.actorId && entry.targetId !== undefined) {
      // Status move hit (no damage)
      const isMyAttack = myPokemonIds.has(entry.actorId);
      const following: LogEntry[] = [];
      let j = i + 1;
      while (j < turnLog.length && !turnLog[j].actorId && turnLog[j].targetId === undefined) {
        following.push(turnLog[j]);
        j++;
      }
      frames.push({
        logLines: [entry, ...following],
        myAnim: isMyAttack ? 'attack-r' : '',
        oppAnim: isMyAttack ? '' : 'attack-l',
        waitMs: 420,
      });
      i = j;

    } else if (entry.actorId && entry.targetId === undefined) {
      // Switch OR miss
      const following: LogEntry[] = [];
      let j = i + 1;
      while (j < turnLog.length && !turnLog[j].actorId && turnLog[j].targetId === undefined) {
        following.push(turnLog[j]);
        j++;
      }

      if (entry.kind === 'meta') {
        // Switch — find which player and new index from final state
        const switchPlayerIdx = finalState.players.findIndex(p =>
          p.team.some(pk => pk.pokemonId === entry.actorId)
        );
        const newIdx = switchPlayerIdx >= 0 ? finalState.players[switchPlayerIdx].activeIndex : 0;
        frames.push({
          logLines: [entry, ...following],
          activeIndexUpdate: switchPlayerIdx >= 0 ? { playerIdx: switchPlayerIdx, index: newIdx } : undefined,
          myAnim: '',
          oppAnim: '',
          waitMs: 450,
        });
      } else {
        // Miss
        const isMyAttack = myPokemonIds.has(entry.actorId ?? '');
        frames.push({
          logLines: [entry, ...following],
          myAnim: isMyAttack ? 'attack-r' : '',
          oppAnim: isMyAttack ? '' : 'attack-l',
          waitMs: 420,
        });
      }
      i = j;

    } else if (!entry.actorId && entry.targetId !== undefined && entry.targetHpAfter !== undefined) {
      // EOT damage (poison / burn)
      const isMyTarget = myPokemonIds.has(entry.targetId);
      frames.push({
        logLines: [entry],
        hpUpdate: { pokemonId: entry.targetId, hp: entry.targetHpAfter },
        myAnim: isMyTarget ? 'shake flash' : '',
        oppAnim: isMyTarget ? '' : 'shake flash',
        waitMs: 800,
      });
      i++;

    } else {
      // Plain text (status apply, tick, faint, etc.)
      frames.push({ logLines: [entry], myAnim: '', oppAnim: '', waitMs: 300 });
      i++;
    }
  }

  return frames;
}

function runAnimFrames(
  frames: AnimFrame[],
  startState: BattleState,
  startLog: LogEntry[],
  onFrame: (state: BattleState, log: LogEntry[], myAnim: string, oppAnim: string) => void,
  onDone: () => void,
): () => void {
  let cancelled = false;
  let timerId: ReturnType<typeof setTimeout> | null = null;
  let curState = startState;
  let curLog = startLog;
  const t0 = performance.now();

  function step(idx: number) {
    if (cancelled) return;
    if (idx >= frames.length) {
      console.log(`[T5] animation ${(performance.now() - t0).toFixed(0)}ms`);
      onDone();
      return;
    }
    const frame = frames[idx];

    curLog = [...curLog, ...frame.logLines];
    if (frame.hpUpdate) curState = applyHpUpdate(curState, frame.hpUpdate.pokemonId, frame.hpUpdate.hp);
    if (frame.activeIndexUpdate) curState = applyActiveIndex(curState, frame.activeIndexUpdate.playerIdx, frame.activeIndexUpdate.index);

    onFrame(curState, curLog, frame.myAnim, frame.oppAnim);

    timerId = setTimeout(() => step(idx + 1), frame.waitMs);
  }

  step(0);
  return () => { cancelled = true; if (timerId) clearTimeout(timerId); };
}

// ---------- AnimSprite -------------------------------------------------------

function AnimSprite({ spriteUrl, name, size, facing, animClass }: {
  spriteUrl: string; name: string; size: number; facing: 'front' | 'back'; animClass: string;
}) {
  const [cls, setCls] = useState('');

  useEffect(() => {
    setCls('enter');
    const t = setTimeout(() => setCls(''), 400);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!animClass) { setCls(''); return; }
    setCls('');
    const raf = requestAnimationFrame(() => setCls(animClass));
    return () => cancelAnimationFrame(raf);
  }, [animClass]);

  return (
    <div className={cls}>
      <CreatureSprite spriteUrl={spriteUrl} name={name} size={size} facing={facing} />
    </div>
  );
}

// ---------- BattleScreen ----------------------------------------------------

function BattleScreen() {
  const { code } = Route.useParams();
  const navigate = useNavigate();
  const { latestTurnData, error } = useBattleState(code);

  const session = (() => {
    try { return JSON.parse(sessionStorage.getItem(`pb:${code}`) ?? '{}'); } catch { return {}; }
  })();
  const playerId: string = session.playerId ?? '';

  const [phase, setPhase] = useState<'choose' | 'waiting' | 'animating' | 'switch'>('choose');
  const [actionError, setActionError] = useState<string | null>(null);
  const [myAnimClass, setMyAnimClass] = useState('');
  const [oppAnimClass, setOppAnimClass] = useState('');
  const [displayState, setDisplayState] = useState<BattleState | null>(null);
  const [displayLog, setDisplayLog] = useState<LogEntry[]>([]);

  const cancelAnimRef = useRef<(() => void) | null>(null);
  const finalStateRef = useRef<BattleState | null>(null);
  const displayStateRef = useRef<BattleState | null>(null);
  const tabHiddenAtRef = useRef<number | null>(null);
  const lastTurnRef = useRef(-1);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  // Keep displayStateRef in sync
  useEffect(() => { displayStateRef.current = displayState; }, [displayState]);

  // Tab visibility handler
  useEffect(() => {
    function onVis() {
      if (document.visibilityState === 'hidden') {
        tabHiddenAtRef.current = Date.now();
      } else if (tabHiddenAtRef.current !== null) {
        const hiddenMs = Date.now() - tabHiddenAtRef.current;
        tabHiddenAtRef.current = null;
        if (phaseRef.current === 'animating' && hiddenMs > 3000 && finalStateRef.current) {
          cancelAnimRef.current?.();
          cancelAnimRef.current = null;
          setDisplayState(finalStateRef.current);
          setDisplayLog([...finalStateRef.current.battleLog]);
          setMyAnimClass('');
          setOppAnimClass('');
          setPhase('choose');
        }
      }
    }
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  // Process incoming turn data
  useEffect(() => {
    if (!latestTurnData) return;
    const { state: finalState, turnLog, firstActorPlayerId } = latestTurnData;
    finalStateRef.current = finalState;

    // First arrival: show immediately
    if (lastTurnRef.current === -1) {
      lastTurnRef.current = finalState.turn;
      setDisplayState(finalState);
      setDisplayLog([...finalState.battleLog]);
      return;
    }

    // Same turn (duplicate/reconnect): ignore
    if (finalState.turn === lastTurnRef.current) return;
    lastTurnRef.current = finalState.turn;

    // Cancel any running animation and get current displayState
    cancelAnimRef.current?.();
    cancelAnimRef.current = null;

    const prevDisplayState = displayStateRef.current ?? finalState;

    // Skip animation if tab was hidden too long
    const hiddenMs = tabHiddenAtRef.current !== null ? Date.now() - tabHiddenAtRef.current : 0;
    if (document.visibilityState === 'hidden' || hiddenMs > 3000) {
      setDisplayState(finalState);
      setDisplayLog([...finalState.battleLog]);
      setPhase('choose');
      return;
    }

    // Build myPokemonIds from prevDisplayState (same team, just need pokemonIds)
    const myIdx = prevDisplayState.players[0].playerId === playerId ? 0 : 1;
    const myPokemonIds = new Set(prevDisplayState.players[myIdx].team.map(p => p.pokemonId));

    const frames = buildAnimFrames(turnLog, myPokemonIds, finalState);

    if (frames.length === 0) {
      setDisplayState(finalState);
      setDisplayLog([...finalState.battleLog]);
      setPhase('choose');
      return;
    }

    setPhase('animating');

    const prevLog = [...prevDisplayState.battleLog];

    cancelAnimRef.current = runAnimFrames(
      frames,
      prevDisplayState,
      prevLog,
      (state, log, myAnim, oppAnim) => {
        setDisplayState(state);
        setDisplayLog(log);
        setMyAnimClass(myAnim);
        setOppAnimClass(oppAnim);
      },
      () => {
        cancelAnimRef.current = null;
        setDisplayState(finalState);
        setDisplayLog([...finalState.battleLog]);
        setMyAnimClass('');
        setOppAnimClass('');
        setPhase('choose');
      },
    );
  }, [latestTurnData]);

  // Auto-open switch panel when active faints
  const myIdx = displayState ? (displayState.players[0].playerId === playerId ? 0 : 1) : 0;
  const oppIdx = 1 - myIdx;

  const canSwitch = displayState
    ? displayState.players[myIdx].team.some((p, i) => p.currentHp > 0 && i !== displayState.players[myIdx].activeIndex)
    : false;
  const myActiveFainted = displayState
    ? displayState.players[myIdx].team[displayState.players[myIdx].activeIndex].currentHp <= 0
    : false;

  useEffect(() => {
    if (!displayState || displayState.status === 'finished') return;
    if (myActiveFainted && canSwitch && phase === 'choose') setPhase('switch');
  }, [myActiveFainted, canSwitch, phase, displayState?.status]);

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

  if (!displayState) {
    return (
      <>
        <TitleBar step={4} />
        <div className="screen" style={{ alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 24, color: 'var(--ink-mute)' }}>Conectando con la batalla…</div>
        </div>
      </>
    );
  }

  const myPlayerState: PlayerState = displayState.players[myIdx];
  const oppPlayerState: PlayerState = displayState.players[oppIdx];
  const myActive: BattlePokemon = myPlayerState.team[myPlayerState.activeIndex];
  const oppActive: BattlePokemon = oppPlayerState.team[oppPlayerState.activeIndex];

  const myEffectiveClass = myActive.currentHp === 0 ? 'faint' : myAnimClass;
  const oppEffectiveClass = oppActive.currentHp === 0 ? 'faint' : oppAnimClass;

  const myBackIsFallback = myActive.spriteBackUrl === myActive.spriteFrontUrl;

  const isAnimating = phase === 'animating';

  async function handleMove(moveId: string) {
    if (phase !== 'choose') return;
    setPhase('waiting');
    setActionError(null);
    try {
      await sendAction(code, playerId, { type: 'move', moveId });
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

  return (
    <>
      <TitleBar step={4} />
      <div className="screen" data-screen-label="04 Batalla">
        <div style={{ flex: 1, display: 'grid', gridTemplateRows: '1fr 280px', gap: 0 }}>

          {/* STAGE */}
          <div style={{ position: 'relative', overflow: 'hidden', background: BG.sky, borderBottom: '4px solid var(--line)' }}>
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '44%', background: BG.floor, opacity: 0.85 }} />
            <div style={{ position: 'absolute', inset: 0, backgroundImage: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.04) 0 2px, transparent 2px 4px)', pointerEvents: 'none', mixBlendMode: 'multiply' }} />

            {/* OPPONENT HP box — top left */}
            <div style={{ position: 'absolute', top: 26, left: 32 }}>
              <HPBox pokemon={oppActive} />
            </div>

            {/* OPPONENT sprite — top right */}
            <div style={{ position: 'absolute', top: 70, right: 110, width: 200, height: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
              <Platform width={220} color={BG.platformColor} style={{ right: -10 }} />
              <div style={{ position: 'relative', zIndex: 2 }}>
                <AnimSprite
                  key={oppActive.pokemonId}
                  spriteUrl={oppActive.spriteFrontUrl}
                  name={oppActive.name}
                  size={170}
                  facing="front"
                  animClass={oppEffectiveClass}
                />
              </div>
            </div>

            {/* PLAYER sprite — bottom left */}
            <div style={{ position: 'absolute', bottom: 28, left: 90, width: 240, height: 220, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
              <Platform width={260} color={BG.platformColor} style={{ left: -10 }} />
              <div style={{ position: 'relative', zIndex: 2, transform: myBackIsFallback ? 'scaleX(-1)' : 'none' }}>
                <AnimSprite
                  key={myActive.pokemonId}
                  spriteUrl={myActive.spriteBackUrl}
                  name={myActive.name}
                  size={200}
                  facing="back"
                  animClass={myEffectiveClass}
                />
              </div>
            </div>

            {/* PLAYER HP box — bottom right */}
            <div style={{ position: 'absolute', bottom: 22, right: 32 }}>
              <HPBox pokemon={myActive} showNumbers />
            </div>

            <NameTag label={`${oppPlayerState.name.toUpperCase()} · RIVAL`} style={{ position: 'absolute', top: 8, right: 16 }} color="var(--accent-2)" avatarId={oppPlayerState.avatarId ?? null} />
            <NameTag label={`${myPlayerState.name.toUpperCase()} · TÚ`} style={{ position: 'absolute', bottom: 6, left: 16 }} color="var(--accent)" avatarId={myPlayerState.avatarId ?? null} />
            <TeamDots team={oppPlayerState.team} style={{ position: 'absolute', top: 32, right: 16 }} label="RIVAL" />
            <TeamDots team={myPlayerState.team} style={{ position: 'absolute', bottom: 6, right: 120 }} label="EQUIPO" />

            {displayState.status === 'finished' && (
              <EndOverlay
                won={displayState.winnerPlayerId === playerId}
                myName={myPlayerState.name}
                oppName={oppPlayerState.name}
                onExit={() => navigate({ to: '/' })}
              />
            )}
          </div>

          {/* BOTTOM PANEL */}
          <div style={{ display: 'grid', gridTemplateColumns: phase === 'switch' ? '1fr' : 'minmax(0, 1fr) 480px', gap: 10, padding: 10, background: 'var(--bg-deep)' }}>
            {phase !== 'switch' && (
              <PixelFrame style={{ overflow: 'hidden', minHeight: 0 }}>
                <BattleLog lines={displayLog} />
              </PixelFrame>
            )}

            <PixelFrame style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0 }}>
              {actionError && (
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--bad)' }}>⚠ {actionError}</div>
              )}
              {phase === 'switch' ? (
                <>
                  {displayLog.length > 0 && (
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--ink-mute)', borderBottom: '2px solid var(--line-soft)', paddingBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {displayLog[displayLog.length - 1].text}
                    </div>
                  )}
                  <SwitchPanel
                    team={myPlayerState.team}
                    active={myPlayerState.activeIndex}
                    onPick={handleSwitch}
                    onCancel={() => setPhase('choose')}
                    mandatory={myActive.currentHp === 0}
                    fullWidth
                  />
                </>
              ) : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', gap: 8, flex: 1, minHeight: 0 }}>
                    {[0, 1, 2, 3].map(i => (
                      <MoveButton
                        key={i}
                        move={myActive.moves[i]}
                        disabled={isAnimating || phase !== 'choose' || displayState.status === 'finished' || myActive.currentHp === 0}
                        onClick={() => myActive.moves[i] && handleMove(myActive.moves[i].moveId)}
                      />
                    ))}
                  </div>
                  <div className="row gap-8">
                    {phase === 'waiting' && (
                      <span style={{ fontFamily: 'var(--font-body)', fontSize: 16, color: 'var(--ink-mute)' }}>Esperando al rival…</span>
                    )}
                    {isAnimating && (
                      <span style={{ fontFamily: 'var(--font-body)', fontSize: 16, color: 'var(--ink-mute)' }}>…</span>
                    )}
                    <button className="btn btn--block" onClick={() => setPhase('switch')} disabled={isAnimating || phase !== 'choose' || !canSwitch || displayState.status === 'finished'}>
                      ⇄ CAMBIAR
                    </button>
                    <button className="btn btn--block" onClick={() => navigate({ to: '/' })} disabled={displayState.status !== 'finished'}>
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

// ---------- Helpers ---------------------------------------------------------

function NameTag({ label, color, avatarId, style }: {
  label: string; color: string; avatarId?: string | null; style: React.CSSProperties;
}) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: color, padding: '2px 8px 2px 4px', border: '2px solid var(--line)', borderRadius: 6, ...style }}>
      {avatarId && (
        <img
          src={`/avatars/${avatarId}.png`}
          alt=""
          width={18}
          height={18}
          style={{ imageRendering: 'pixelated', display: 'block', flexShrink: 0 }}
          draggable={false}
        />
      )}
      <span style={{ fontFamily: 'var(--font-label)', fontSize: 10, letterSpacing: 1, color: '#fff', textShadow: '1px 1px 0 rgba(0,0,0,0.4)' }}>
        {label}
      </span>
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

function SwitchPanel({ team, active, onPick, onCancel, mandatory, fullWidth }: {
  team: BattlePokemon[]; active: number; onPick: (i: number) => void;
  onCancel: () => void; mandatory: boolean; fullWidth?: boolean;
}) {
  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="pixel-label">CAMBIAR CRIATURA</span>
        {!mandatory && <button className="btn btn--sm btn--ghost" onClick={onCancel}>← VOLVER</button>}
      </div>
      {mandatory && (
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--bad)' }}>
          Tu Pokémon se debilitó. Elige un reemplazo.
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: fullWidth ? 'repeat(3, 1fr)' : '1fr 1fr', gap: 6 }}>
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
                <CreatureSprite spriteUrl={p.spriteFrontUrl} name={p.name} size={36} />
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
