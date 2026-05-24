import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState, useEffect } from 'react';
import { useUser, useAuth } from '@clerk/clerk-react';
import { setAvatar } from '../lib/api';
import { VALID_AVATARS } from '../lib/avatars';
import { TitleBar } from '../components/shared';

export const Route = createFileRoute('/select-avatar')({
  component: SelectAvatarScreen,
});

function SelectAvatarScreen() {
  const navigate = useNavigate();
  const { isLoaded, isSignedIn, user } = useUser();
  const { getToken } = useAuth();
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Redirect guests and already-configured users
  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) { navigate({ to: '/' }); return; }
    if (user?.publicMetadata?.avatarId) { navigate({ to: '/' }); }
  }, [isLoaded, isSignedIn, user?.publicMetadata?.avatarId]);

  async function handleConfirm() {
    if (!selected || loading) return;
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error('Sin sesión activa');
      await setAvatar(selected, token);
      await user!.reload();
      navigate({ to: '/' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar el avatar');
      setLoading(false);
    }
  }

  if (!isLoaded) return null;

  return (
    <>
      <TitleBar step={1} />
      <div className="screen" data-screen-label="Avatar">
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 28,
          padding: '32px 40px',
        }}>
          <div style={{ textAlign: 'center' }}>
            <h1 style={{
              margin: 0,
              fontFamily: 'var(--font-label)',
              fontSize: 32,
              letterSpacing: 1,
              color: 'var(--ink)',
              textShadow: '3px 3px 0 var(--line-soft)',
            }}>
              ELIGE TU ENTRENADOR
            </h1>
            <p style={{
              margin: '8px 0 0',
              fontFamily: 'var(--font-body)',
              fontSize: 18,
              color: 'var(--ink-soft)',
              letterSpacing: 0.4,
            }}>
              Esta decisión es permanente.
            </p>
          </div>

          {/* 4x2 sprite grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 16,
          }}>
            {VALID_AVATARS.map((id) => (
              <AvatarOption
                key={id}
                id={id}
                isSelected={selected === id}
                onSelect={() => setSelected(id)}
              />
            ))}
          </div>

          {error && (
            <div style={{
              fontFamily: 'var(--font-body)',
              fontSize: 16,
              color: 'var(--bad)',
              letterSpacing: 0.3,
            }}>
              ⚠ {error}
            </div>
          )}

          <button
            className="btn btn--primary btn--lg"
            style={{ minWidth: 220, fontSize: 18 }}
            disabled={!selected || loading}
            onClick={handleConfirm}
          >
            {loading ? 'GUARDANDO…' : 'CONFIRMAR ▶'}
          </button>
        </div>
      </div>
    </>
  );
}

function AvatarOption({ id, isSelected, onSelect }: {
  id: string;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 120,
        height: 120,
        padding: 12,
        background: isSelected
          ? 'var(--hl)'
          : hovered
          ? 'var(--surface)'
          : 'var(--surface-sunk)',
        border: isSelected
          ? '4px solid var(--accent)'
          : hovered
          ? '3px solid var(--line)'
          : '3px solid var(--line-soft)',
        borderRadius: 12,
        cursor: 'pointer',
        boxShadow: isSelected
          ? '0 0 0 2px var(--accent), 4px 4px 0 var(--line)'
          : '2px 2px 0 var(--line-soft)',
        transition: 'background 80ms, border-color 80ms, box-shadow 80ms',
        outline: 'none',
      }}
    >
      <img
        src={`/avatars/${id}.png`}
        alt=""
        width={80}
        height={80}
        style={{ imageRendering: 'pixelated', display: 'block' }}
        draggable={false}
      />
    </button>
  );
}
