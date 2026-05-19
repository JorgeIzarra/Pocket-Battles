import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { createRoom, joinRoom } from '../lib/api';
import { BrandMark, PixelFrame, TitleBar } from '../components/shared';

export const Route = createFileRoute('/')({
  component: HomeScreen,
});

function HomeScreen() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedName = name.trim();
  const trimmedCode = code.trim().toUpperCase();
  const canCreate = trimmedName.length >= 2;
  const canJoin = canCreate && trimmedCode.length >= 4;

  async function handleCreate() {
    if (!canCreate || loading) return;
    setLoading(true);
    setError(null);
    try {
      const { code: roomCode, playerId } = await createRoom(trimmedName);
      sessionStorage.setItem(`pb:${roomCode}`, JSON.stringify({ playerId, name: trimmedName }));
      navigate({ to: '/lobby/$code', params: { code: roomCode } });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al crear la sala');
    } finally {
      setLoading(false);
    }
  }

  async function handleJoin() {
    if (!canJoin || loading) return;
    setLoading(true);
    setError(null);
    try {
      const { playerId } = await joinRoom(trimmedCode, trimmedName);
      sessionStorage.setItem(`pb:${trimmedCode}`, JSON.stringify({ playerId, name: trimmedName }));
      navigate({ to: '/lobby/$code', params: { code: trimmedCode } });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al unirse a la sala');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <TitleBar step={1} />
      <div className="screen" data-screen-label="01 Inicio">
        <div style={{
          flex: 1, display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
          gap: 24, padding: '28px 36px 36px', alignItems: 'stretch',
        }}>
          {/* LEFT — brand + name */}
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
              <BrandMark size={64} />
              <div>
                <h1 style={{ margin: 0, fontFamily: 'var(--font-label)', fontSize: 38, letterSpacing: 1, color: 'var(--ink)', lineHeight: 1, textShadow: '3px 3px 0 var(--line-soft)' }}>
                  POCKET<br />BATTLES
                </h1>
                <div style={{ marginTop: 6, fontFamily: 'var(--font-body)', fontSize: 20, color: 'var(--ink-soft)', letterSpacing: 0.5 }}>
                  Combates por turnos, 1 v 1, por código de sala.
                </div>
              </div>
            </div>

            <PixelFrame style={{ padding: 18 }}>
              <div className="col gap-8">
                <label className="pixel-label" htmlFor="player-name">Nombre del entrenador</label>
                <input
                  id="player-name"
                  className="pinput"
                  placeholder="Tu nombre…"
                  value={name}
                  onChange={(e) => setName(e.target.value.slice(0, 14))}
                  maxLength={14}
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                />
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 16, color: 'var(--ink-mute)', letterSpacing: 0.4 }}>
                  Sin registro. Solo se usa para esta partida.
                  <span style={{ float: 'right' }}>{trimmedName.length}/14</span>
                </div>
              </div>
            </PixelFrame>

            {error && (
              <div style={{ marginTop: 10, fontFamily: 'var(--font-body)', fontSize: 17, color: 'var(--bad)', letterSpacing: 0.3 }}>
                ⚠ {error}
              </div>
            )}

            <div style={{ marginTop: 'auto', paddingTop: 18, fontFamily: 'var(--font-label)', fontSize: 10, letterSpacing: 1, color: 'var(--ink-mute)' }}>
              v0.1.0 · proyecto académico · datos vía PokéAPI
            </div>
          </div>

          {/* RIGHT — action cards */}
          <div style={{ display: 'grid', gridTemplateRows: '1fr 1fr', gap: 18 }}>
            {/* CREATE */}
            <PixelFrame style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="pixel-label" style={{ color: 'var(--accent)' }}>OPCIÓN A</span>
                <span className="pixel-label">anfitrión</span>
              </div>
              <h2 style={{ margin: 0, fontFamily: 'var(--font-label)', fontSize: 22, letterSpacing: 0.6, color: 'var(--ink)' }}>CREAR SALA</h2>
              <p style={{ margin: 0, fontFamily: 'var(--font-body)', fontSize: 19, color: 'var(--ink-soft)', letterSpacing: 0.3, lineHeight: 1.2 }}>
                Abre una sala nueva y obtén un código de 5 letras para compartir con tu rival.
              </p>
              <button className="btn btn--primary btn--lg btn--block" disabled={!canCreate || loading} onClick={handleCreate}>
                {loading ? 'CREANDO…' : 'CREAR SALA ▶'}
              </button>
            </PixelFrame>

            {/* JOIN */}
            <PixelFrame variant="sunk" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="pixel-label" style={{ color: 'var(--accent-2)' }}>OPCIÓN B</span>
                <span className="pixel-label">invitado</span>
              </div>
              <h2 style={{ margin: 0, fontFamily: 'var(--font-label)', fontSize: 22, letterSpacing: 0.6, color: 'var(--ink)' }}>UNIRSE A SALA</h2>
              <div className="row gap-8" style={{ alignItems: 'stretch' }}>
                <input
                  className="pinput"
                  placeholder="CÓDIGO"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/[^A-Z0-9]/gi, '').slice(0, 5))}
                  maxLength={5}
                  style={{ flex: 1, textAlign: 'center', letterSpacing: 4, textTransform: 'uppercase', fontSize: 26 }}
                  onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                />
                <button className="btn btn--secondary btn--lg" disabled={!canJoin || loading} onClick={handleJoin} style={{ minWidth: 120 }}>
                  {loading ? '…' : 'UNIRSE ▶'}
                </button>
              </div>
              <p style={{ margin: 0, fontFamily: 'var(--font-body)', fontSize: 17, color: 'var(--ink-mute)', letterSpacing: 0.3, lineHeight: 1.2 }}>
                Pide el código a quien creó la sala.
              </p>
            </PixelFrame>
          </div>
        </div>
      </div>
    </>
  );
}
