import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useRoom } from '../hooks/useRoom';
import { startBattle } from '../lib/api';
import { PixelFrame, Pulse, TitleBar } from '../components/shared';

export const Route = createFileRoute('/lobby/$code')({
  component: LobbyScreen,
});

function LobbyScreen() {
  const { code } = Route.useParams();
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const session = (() => {
    try { return JSON.parse(sessionStorage.getItem(`pb:${code}`) ?? '{}'); } catch { return {}; }
  })();
  const playerName: string = session.name ?? '?';
  const playerId: string = session.playerId ?? '';

  const { room } = useRoom(code, 2000);

  const p1 = room?.players[0];
  const p2 = room?.players[1];
  const bothReady = room?.players.length === 2;
  const isHost = p1?.name === playerName;

  // Navigate when battle starts
  if (room?.status === 'in_battle') {
    navigate({ to: '/battle/$code', params: { code } });
  }

  function copy() {
    navigator.clipboard?.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  }

  async function handleStart() {
    if (!bothReady || starting) return;
    setStarting(true);
    setError(null);
    try {
      // Before starting, redirect both to team selection — the host goes to team first
      navigate({ to: '/team/$code', params: { code } });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
      setStarting(false);
    }
  }

  return (
    <>
      <TitleBar step={2} />
      <div className="screen" data-screen-label="02 Lobby">
        <div style={{ flex: 1, padding: '26px 40px 32px', display: 'grid', gridTemplateRows: 'auto 1fr auto', gap: 18 }}>
          {/* Header */}
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div>
              <div className="pixel-label" style={{ color: 'var(--accent)' }}>SALA DE ESPERA</div>
              <h2 style={{ margin: '4px 0 0', fontFamily: 'var(--font-label)', fontSize: 26, letterSpacing: 0.6, color: 'var(--ink)' }}>
                {bothReady ? '¡Sala llena! Procedan al equipo.' : 'Esperando a que se llene la sala'}
              </h2>
            </div>
            <button className="btn btn--ghost btn--sm" onClick={() => navigate({ to: '/' })}>← SALIR</button>
          </div>

          {/* Body */}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 420px) minmax(0, 1fr)', gap: 22 }}>
            {/* Code card */}
            <PixelFrame style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="pixel-label">CÓDIGO DE SALA</div>
              <div style={{ padding: '18px 12px', background: 'var(--surface-sunk)', border: '3px solid var(--line)', borderRadius: 12, boxShadow: 'inset 0 0 0 2px var(--surface-sunk), inset 0 0 0 3px var(--line-soft)', textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--font-label)', fontSize: 64, letterSpacing: 12, color: 'var(--ink)', textShadow: '3px 3px 0 var(--line-soft)' }}>
                  {code}
                </div>
              </div>
              <button className="btn btn--primary btn--block" onClick={copy}>
                {copied ? '✓ COPIADO' : '⧉ COPIAR CÓDIGO'}
              </button>
              <PixelFrame variant="sunk" style={{ padding: '10px 14px', fontFamily: 'var(--font-body)', fontSize: 18, color: 'var(--ink-soft)', lineHeight: 1.2 }}>
                <b style={{ color: 'var(--accent)' }}>TIP:</b> Comparte este código con tu rival para que pueda unirse.
              </PixelFrame>
            </PixelFrame>

            {/* Players */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'stretch', gap: 14 }}>
              <PlayerSlot name={p1?.name ?? playerName} role="ANFITRIÓN" filled={!!p1} ready={!!p1} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-label)', fontSize: 36, letterSpacing: 2, color: 'var(--ink-mute)' }}>VS</div>
              <PlayerSlot name={p2?.name ?? ''} role="INVITADO" filled={!!p2} ready={!!p2} />
            </div>
          </div>

          {/* Footer */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 16, alignItems: 'center' }}>
            <PixelFrame variant="sunk" style={{ padding: '12px 18px' }}>
              <div className="row gap-12">
                <Pulse />
                <span style={{ fontFamily: 'var(--font-body)', fontSize: 20, color: 'var(--ink-soft)', letterSpacing: 0.3 }}>
                  {bothReady
                    ? <><b style={{ color: 'var(--good)' }}>¡Listos!</b> Ambos entrenadores están en la sala.</>
                    : <>Esperando a que un segundo entrenador se una con el código…</>
                  }
                </span>
              </div>
              {error && <div style={{ marginTop: 4, color: 'var(--bad)', fontFamily: 'var(--font-body)', fontSize: 16 }}>⚠ {error}</div>}
            </PixelFrame>
            <button className="btn btn--primary btn--lg" disabled={!bothReady || starting} onClick={handleStart}>
              {starting ? 'INICIANDO…' : 'ELEGIR EQUIPO ▶'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function PlayerSlot({ name, role, filled, ready }: { name: string; role: string; filled: boolean; ready: boolean }) {
  return (
    <PixelFrame variant={filled ? undefined : 'sunk'} style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8, opacity: filled ? 1 : 0.95 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="pixel-label" style={{ color: filled ? 'var(--accent-2)' : 'var(--ink-mute)' }}>{role}</span>
        {filled
          ? <span className="pixel-label" style={{ color: 'var(--good)' }}>● LISTO</span>
          : <span className="pixel-label" style={{ color: 'var(--ink-mute)' }}>● ESPERANDO</span>
        }
      </div>
      <div style={{ position: 'relative', flex: 1, minHeight: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface-sunk)', border: '3px dashed var(--line-soft)', borderRadius: 12, overflow: 'hidden' }}>
        {filled ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <TrainerSilhouette type={role === 'ANFITRIÓN' ? 'host' : 'guest'} />
            <span style={{ fontFamily: 'var(--font-label)', fontSize: 22, letterSpacing: 1, color: 'var(--ink)' }}>{name}</span>
          </div>
        ) : (
          <div className="col" style={{ alignItems: 'center', gap: 10 }}>
            <Pulse />
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 20, color: 'var(--ink-mute)', letterSpacing: 0.5, animation: 'blink 1.2s steps(1) infinite' }}>
              esperando jugador…
            </span>
          </div>
        )}
      </div>
    </PixelFrame>
  );
}

function TrainerSilhouette({ type }: { type: 'host' | 'guest' }) {
  const color = type === 'host' ? 'var(--accent)' : 'var(--accent-2)';
  return (
    <div style={{ position: 'relative', width: 110, height: 130 }}>
      <svg viewBox="0 0 64 80" width={110} height={130} style={{ shapeRendering: 'crispEdges', imageRendering: 'pixelated', filter: 'drop-shadow(2px 3px 0 rgba(0,0,0,0.2))' }}>
        <path d="M18 10 H46 V18 H50 V24 H14 V18 H18 Z" fill={color} stroke="#1a1410" strokeWidth="1.5" />
        <rect x="22" y="22" width="20" height="14" fill="#e0c69a" stroke="#1a1410" strokeWidth="1.5" />
        <path d="M16 36 H48 V60 H44 V72 H20 V60 H16 Z" fill={color} stroke="#1a1410" strokeWidth="1.5" />
        <rect x="10" y="38" width="6" height="20" fill={color} stroke="#1a1410" strokeWidth="1.5" />
        <rect x="48" y="38" width="6" height="20" fill={color} stroke="#1a1410" strokeWidth="1.5" />
        <rect x="22" y="68" width="8" height="10" fill="#3a2a1a" stroke="#1a1410" strokeWidth="1.5" />
        <rect x="34" y="68" width="8" height="10" fill="#3a2a1a" stroke="#1a1410" strokeWidth="1.5" />
        <rect x="28" y="28" width="3" height="3" fill="#1a1410" />
        <rect x="34" y="28" width="3" height="3" fill="#1a1410" />
      </svg>
    </div>
  );
}
