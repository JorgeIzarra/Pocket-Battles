import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState, useEffect } from 'react';
import { useUser, useAuth, SignInButton, UserButton } from '@clerk/clerk-react';
import { createRoom, joinRoom, createCheckoutSession } from '../lib/api';
import { useSubscription } from '../hooks/useSubscription';
import { BrandMark, PixelFrame, TitleBar } from '../components/shared';

export const Route = createFileRoute('/')({
  component: HomeScreen,
});

function HomeScreen() {
  const navigate = useNavigate();
  const { isLoaded, isSignedIn, user } = useUser();
  const { getToken } = useAuth();

  const { isPremium, loading: subLoading, refresh: refreshSub } = useSubscription();

  const [guestName, setGuestName] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [premiumToast, setPremiumToast] = useState(false);

  // Redirect authenticated users who haven't chosen an avatar yet
  useEffect(() => {
    if (isLoaded && isSignedIn && !user?.publicMetadata?.avatarId) {
      navigate({ to: '/select-avatar' });
    }
  }, [isLoaded, isSignedIn, user?.publicMetadata?.avatarId]);

  // Detectar retorno desde Stripe Checkout con ?premium=success
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('premium') === 'success') {
      refreshSub();
      setPremiumToast(true);
      history.replaceState(null, '', '/');
      const t = setTimeout(() => setPremiumToast(false), 5000);
      return () => clearTimeout(t);
    }
  }, []);

  // Nombre derivado del perfil de Clerk; fallback robusto para cuentas solo con email
  const clerkName = user
    ? (user.fullName ??
       user.username ??
       user.primaryEmailAddress?.emailAddress?.split('@')[0] ??
       'Entrenador')
    : null;

  // Nombre activo: viene de Clerk si está autenticado, del input si es invitado
  const playerName = isSignedIn ? (clerkName ?? '') : guestName.trim();

  const trimmedCode = code.trim().toUpperCase();
  const canCreate = playerName.length >= 2;
  const canJoin = canCreate && trimmedCode.length >= 4;

  const avatarId = isSignedIn ? ((user?.publicMetadata?.avatarId as string | undefined) ?? null) : null;

  async function handlePremium() {
    if (!isSignedIn || loading) return;
    setLoading(true);
    setError(null);
    try {
      const token = (await getToken()) ?? '';
      const { url } = await createCheckoutSession(token);
      if (url) window.location.href = url;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al iniciar el pago');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!canCreate || loading) return;
    setLoading(true);
    setError(null);
    try {
      const token = isSignedIn ? (await getToken() ?? undefined) : undefined;
      const { code: roomCode, playerId } = await createRoom(playerName, token, avatarId);
      sessionStorage.setItem(`pb:${roomCode}`, JSON.stringify({ playerId, name: playerName }));
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
      const token = isSignedIn ? (await getToken() ?? undefined) : undefined;
      const { playerId } = await joinRoom(trimmedCode, playerName, token, avatarId);
      sessionStorage.setItem(`pb:${trimmedCode}`, JSON.stringify({ playerId, name: playerName }));
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
      <div className="screen" data-screen-label="01 Inicio" style={{ position: 'relative' }}>

        {/* Botón de sesión + badge Premium — esquina superior derecha */}
        <div style={{ position: 'absolute', top: 14, right: 18, zIndex: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
          {isLoaded && isSignedIn && isPremium && (
            <span style={{
              fontFamily: 'var(--font-label)', fontSize: 11, letterSpacing: 1,
              color: 'var(--accent)', background: 'var(--bg-raised)',
              border: '1.5px solid var(--accent)', borderRadius: 4,
              padding: '3px 8px', lineHeight: 1,
            }}>
              ✨ PREMIUM
            </span>
          )}
          {isLoaded && isSignedIn ? (
            <UserButton afterSignOutUrl="/" />
          ) : (
            <SignInButton mode="modal">
              <button
                className="btn btn--secondary"
                style={{ fontSize: 13, padding: '5px 12px', letterSpacing: 0.5 }}
              >
                INICIAR SESIÓN
              </button>
            </SignInButton>
          )}
        </div>

        {/* Toast de bienvenida Premium */}
        {premiumToast && (
          <div style={{
            position: 'absolute', top: 52, right: 18, zIndex: 20,
            fontFamily: 'var(--font-label)', fontSize: 13, letterSpacing: 0.8,
            color: 'var(--accent)', background: 'var(--bg-raised)',
            border: '2px solid var(--accent)', borderRadius: 6,
            padding: '8px 16px', boxShadow: '4px 4px 0 var(--line-soft)',
          }}>
            ✨ ¡Eres Premium! Bienvenido al club.
          </div>
        )}

        <div style={{
          flex: 1, display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
          gap: 24, padding: '28px 36px 36px', alignItems: 'stretch',
        }}>
          {/* LEFT — brand + nombre del entrenador */}
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

            {/* Modo autenticado: muestra perfil de Clerk */}
            {isLoaded && isSignedIn ? (
              <PixelFrame style={{ padding: 18 }}>
                <div className="col gap-8">
                  <label className="pixel-label">Entrenador</label>
                  <div style={{
                    fontFamily: 'var(--font-label)', fontSize: 24,
                    color: 'var(--ink)', letterSpacing: 0.5,
                  }}>
                    {clerkName}
                  </div>
                  {user?.primaryEmailAddress?.emailAddress && (
                    <div style={{
                      fontFamily: 'var(--font-body)', fontSize: 15,
                      color: 'var(--ink-mute)', letterSpacing: 0.3,
                    }}>
                      {user.primaryEmailAddress.emailAddress}
                    </div>
                  )}
                  {!subLoading && !isPremium && (
                    <button
                      className="btn btn--primary btn--block"
                      style={{ marginTop: 12, fontSize: 13, letterSpacing: 0.8, padding: '8px 12px' }}
                      onClick={handlePremium}
                      disabled={loading}
                    >
                      ✨ POCKET BATTLES PREMIUM · $4.99/mes
                    </button>
                  )}
                </div>
              </PixelFrame>
            ) : (
              /* Modo invitado: input de nombre */
              <PixelFrame style={{ padding: 18 }}>
                <div className="col gap-8">
                  <label className="pixel-label" htmlFor="player-name">Nombre del entrenador</label>
                  <input
                    id="player-name"
                    className="pinput"
                    placeholder="Tu nombre…"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value.slice(0, 14))}
                    maxLength={14}
                    autoFocus={!isSignedIn}
                    onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                  />
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: 16, color: 'var(--ink-mute)', letterSpacing: 0.4 }}>
                    Sin registro. Solo se usa para esta partida.
                    <span style={{ float: 'right' }}>{guestName.trim().length}/14</span>
                  </div>
                </div>
              </PixelFrame>
            )}

            {error && (
              <div style={{ marginTop: 10, fontFamily: 'var(--font-body)', fontSize: 17, color: 'var(--bad)', letterSpacing: 0.3 }}>
                ⚠ {error}
              </div>
            )}

            <div style={{ marginTop: 'auto', paddingTop: 18, fontFamily: 'var(--font-label)', fontSize: 10, letterSpacing: 1, color: 'var(--ink-mute)' }}>
              v0.1.0 · proyecto académico · datos vía PokéAPI
            </div>
          </div>

          {/* RIGHT — tarjetas de acción (sin cambios funcionales) */}
          <div style={{ display: 'grid', gridTemplateRows: '1fr 1fr', gap: 18 }}>
            {/* CREAR */}
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

            {/* UNIRSE */}
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
