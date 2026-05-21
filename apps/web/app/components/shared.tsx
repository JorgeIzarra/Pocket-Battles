import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { typeColor } from '../lib/types';
import type { BattlePokemon, LogEntry, StatusEffect } from '../hooks/useBattleState';

// ---------- TypeBadge -------------------------------------------------------
interface TypeBadgeProps { type: string; size?: 'sm' | 'md' | 'lg' | 'xl'; }
export function TypeBadge({ type, size = 'md' }: TypeBadgeProps) {
  const cls = size === 'lg' ? 'tb tb--lg'
    : size === 'sm' ? 'tb tb--sm'
    : size === 'xl' ? 'tb tb--xl'
    : 'tb';
  return (
    <span className={cls} style={{ background: typeColor(type) }}>
      {type}
    </span>
  );
}

// ---------- PixelFrame ------------------------------------------------------
interface PixelFrameProps {
  as?: keyof JSX.IntrinsicElements;
  className?: string;
  variant?: 'sunk' | 'flat';
  style?: CSSProperties;
  children?: ReactNode;
  [key: string]: unknown;
}
export function PixelFrame({ as: Tag = 'div', className = '', variant, style, children, ...rest }: PixelFrameProps) {
  const cls = ['pf', variant ? `pf--${variant}` : '', className].filter(Boolean).join(' ');
  const El = Tag as 'div';
  return <El className={cls} style={style} {...(rest as object)}>{children}</El>;
}

// ---------- HealthBar -------------------------------------------------------
interface HealthBarProps { current: number; max: number; }
export function HealthBar({ current, max }: HealthBarProps) {
  const pct = Math.max(0, Math.min(100, (current / max) * 100));
  const level = pct > 50 ? 'high' : pct > 20 ? 'mid' : 'low';
  return (
    <div className={`hpbar hpbar--${level}`}>
      <div className="hpbar__fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

// ---------- StatusBadge -----------------------------------------------------
const STATUS_MAP: Record<string, { label: string; color: string }> = {
  poison:    { label: 'TOX', color: '#8c5cb4' },
  burn:      { label: 'QMD', color: '#e45a3a' },
  paralysis: { label: 'PAR', color: '#e8b734' },
  atk_down:  { label: 'ATK↓', color: '#4a3a48' },
  def_down:  { label: 'DEF↓', color: '#4a3a48' },
  spe_down:  { label: 'SPE↓', color: '#4a3a48' },
};

interface StatusBadgeProps { status: StatusEffect | null; }
export function StatusBadge({ status }: StatusBadgeProps) {
  if (!status) return null;
  const s = STATUS_MAP[status.kind];
  if (!s) return null;
  return (
    <span
      className="status-badge"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        fontFamily: 'var(--font-label)', fontSize: 9, padding: '2px 5px 1px',
        color: '#fff', background: s.color,
        border: '2px solid var(--line)', borderRadius: 4,
        textShadow: '1px 1px 0 rgba(0,0,0,0.4)', letterSpacing: 0.5,
      }}
      title={`${status.kind} (${status.remainingTurns} turnos)`}
    >
      {s.label}
      <small style={{ opacity: 0.85 }}>·{status.remainingTurns}</small>
    </span>
  );
}

// ---------- HPBox -----------------------------------------------------------
interface HPBoxProps {
  pokemon: BattlePokemon;
  showNumbers?: boolean;
  align?: 'left' | 'right';
}
export function HPBox({ pokemon, showNumbers = false }: HPBoxProps) {
  return (
    <PixelFrame style={{ padding: '8px 12px 9px', width: 268, background: 'var(--surface)' }}>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
        <div className="row gap-8" style={{ minWidth: 0 }}>
          <span style={{
            fontFamily: 'var(--font-label)', fontSize: 13, letterSpacing: 0.6,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            color: 'var(--ink)',
          }}>
            {pokemon.name}
          </span>
          <StatusBadge status={pokemon.status} />
        </div>
        <span style={{ fontFamily: 'var(--font-label)', fontSize: 11, color: 'var(--ink-soft)', whiteSpace: 'nowrap' }}>
          Lv{pokemon.level}
        </span>
      </div>
      <div className="row gap-8">
        <span style={{ fontFamily: 'var(--font-label)', fontSize: 10, color: 'var(--accent)', letterSpacing: 0.5 }}>HP</span>
        <div style={{ flex: 1 }}>
          <HealthBar current={pokemon.currentHp} max={pokemon.maxHp} />
        </div>
      </div>
      <div className="row gap-8" style={{ marginTop: 4, justifyContent: 'space-between' }}>
        <div className="row gap-4">
          {pokemon.types.map(t => <TypeBadge key={t} type={t} size="sm" />)}
        </div>
        {showNumbers && (
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 18, lineHeight: 1, color: 'var(--ink)', letterSpacing: 1 }}>
            {pokemon.currentHp}<span style={{ color: 'var(--ink-mute)' }}>/{pokemon.maxHp}</span>
          </span>
        )}
      </div>
    </PixelFrame>
  );
}

// ---------- CreatureSprite --------------------------------------------------
interface CreatureSpriteProps {
  spriteUrl: string;
  name: string;
  size?: number;
  facing?: 'front' | 'back';
  className?: string;
  style?: CSSProperties;
}
export function CreatureSprite({ spriteUrl, name, size = 160, facing = 'front', className = '', style = {} }: CreatureSpriteProps) {
  return (
    <img
      src={spriteUrl}
      alt={name}
      width={size}
      height={size}
      className={className}
      style={{
        imageRendering: 'pixelated',
        transform: facing === 'back' ? 'scaleX(-1)' : 'none',
        filter: 'drop-shadow(2px 3px 0 rgba(0,0,0,0.18))',
        objectFit: 'contain',
        ...style,
      }}
    />
  );
}

// ---------- Platform --------------------------------------------------------
interface PlatformProps { width?: number; color?: string; style?: CSSProperties; }
export function Platform({ width = 220, color = 'var(--t-grass)', style }: PlatformProps) {
  return (
    <div style={{
      position: 'absolute', bottom: -8,
      width, height: width * 0.28, borderRadius: '50%',
      background: `radial-gradient(ellipse at center, ${color} 0%, ${color} 55%, rgba(0,0,0,0.0) 75%)`,
      opacity: 0.55,
      ...style,
    }} />
  );
}

// ---------- MoveButton ------------------------------------------------------
interface MoveButtonMove {
  moveId: string;
  name: string;
  type: string;
  power: number | null;
  damageClass: string;
}
interface MoveButtonProps {
  move: MoveButtonMove | undefined;
  onClick?: () => void;
  disabled?: boolean;
  compact?: boolean;
}
export function MoveButton({ move, onClick, disabled, compact = false }: MoveButtonProps) {
  if (!move) {
    return (
      <button className="btn" disabled style={{ minHeight: compact ? 56 : 72, justifyContent: 'center', opacity: 0.4 }}>
        — VACÍO —
      </button>
    );
  }
  const color = typeColor(move.type);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="move-btn"
      style={{
        position: 'relative', display: 'flex', flexDirection: 'column',
        alignItems: 'flex-start', justifyContent: 'space-between',
        minHeight: compact ? 56 : 72,
        padding: compact ? '8px 12px' : '10px 14px',
        background: color, color: '#fff',
        border: '3px solid var(--line)', borderRadius: 10,
        boxShadow: 'inset 0 -4px 0 rgba(0,0,0,0.25), inset 0 2px 0 rgba(255,255,255,0.25), 0 3px 0 var(--shadow)',
        fontFamily: 'var(--font-label)', letterSpacing: 0.6,
        textShadow: '1px 1px 0 rgba(0,0,0,0.4)',
        textAlign: 'left',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'transform 80ms',
      }}
      onMouseDown={(e) => { if (!disabled) (e.currentTarget as HTMLElement).style.transform = 'translateY(2px)'; }}
      onMouseUp={(e) => { (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'; }}
    >
      <span style={{ fontSize: compact ? 12 : 14 }}>{move.name}</span>
      <span style={{ display: 'flex', justifyContent: 'space-between', width: '100%', fontSize: compact ? 9 : 10, opacity: 0.95, letterSpacing: 0.8 }}>
        <span>{move.damageClass.toUpperCase()}</span>
        <span>POW {move.power ?? '—'}</span>
      </span>
    </button>
  );
}

// ---------- CreatureCard (catalog/team selection) ---------------------------
interface CreatureCardCreature {
  _id: string;
  pokedexId: number;
  name: string;
  types: string[];
  baseStats: Record<string, number>;
  spriteFrontUrl: string;
}
interface CreatureCardProps {
  creature: CreatureCardCreature;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}
export function CreatureCard({ creature, selected, disabled, onClick }: CreatureCardProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'stretch',
        padding: 8,
        background: selected ? 'var(--hl)' : 'var(--surface)',
        border: `3px solid ${selected ? 'var(--accent)' : 'var(--line)'}`,
        borderRadius: 10,
        boxShadow: selected
          ? 'inset 0 0 0 2px var(--hl), inset 0 0 0 3px var(--accent), 0 2px 0 var(--shadow)'
          : 'inset 0 0 0 2px var(--surface), inset 0 0 0 3px var(--line-soft), 0 2px 0 var(--shadow)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1,
        gap: 4, textAlign: 'left',
        fontFamily: 'var(--font-body)', color: 'var(--ink)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'center', background: 'var(--surface-sunk)', border: '2px solid var(--line-soft)', borderRadius: 6, padding: 4 }}>
        <CreatureSprite spriteUrl={creature.spriteFrontUrl} name={creature.name} size={64} />
      </div>
      <div className="row" style={{ justifyContent: 'space-between', marginTop: 2 }}>
        <span style={{ fontFamily: 'var(--font-label)', fontSize: 11, letterSpacing: 0.5 }}>{creature.name}</span>
        <span style={{ fontFamily: 'var(--font-label)', fontSize: 9, color: 'var(--ink-mute)' }}>#{creature.pokedexId}</span>
      </div>
      <div className="row gap-4">
        {creature.types.map(t => <TypeBadge key={t} type={t} size="sm" />)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 8px', marginTop: 2, fontFamily: 'var(--font-label)', fontSize: 10, color: 'var(--ink-soft)' }}>
        <span>HP <b style={{ color: 'var(--ink)' }}>{creature.baseStats.hp}</b></span>
        <span>ATK <b style={{ color: 'var(--ink)' }}>{creature.baseStats.atk}</b></span>
        <span>DEF <b style={{ color: 'var(--ink)' }}>{creature.baseStats.def}</b></span>
        <span>SPD <b style={{ color: 'var(--ink)' }}>{creature.baseStats.spe}</b></span>
      </div>
      {selected && (
        <div style={{
          position: 'absolute', top: -8, right: -8, width: 24, height: 24, borderRadius: '50%',
          background: 'var(--accent)', color: '#fff', border: '2px solid var(--line)',
          fontFamily: 'var(--font-label)', fontSize: 11,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 2px 0 var(--shadow)',
        }}>✓</div>
      )}
    </button>
  );
}

// ---------- BattleLog -------------------------------------------------------
interface BattleLogProps { lines: LogEntry[]; }
export function BattleLog({ lines }: BattleLogProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [lines.length]);
  return (
    <div ref={ref} className="dialog scroll-box" style={{ height: '100%', padding: '10px 16px' }}>
      {lines.length === 0 ? (
        <div className="dialog__line dialog__line--meta">¿Qué hará tu criatura?</div>
      ) : lines.map((l, i) => (
        <div key={i} className={`dialog__line${l.kind ? ` dialog__line--${l.kind}` : ''}`}>
          {l.text}
        </div>
      ))}
    </div>
  );
}

// ---------- Pulse -----------------------------------------------------------
export function Pulse() {
  return (
    <span style={{
      display: 'inline-block', width: 12, height: 12, borderRadius: '50%',
      background: 'var(--accent)', boxShadow: '0 0 0 3px var(--hl)',
      animation: 'pulse 900ms ease-in-out infinite',
    }} />
  );
}

// ---------- BrandMark -------------------------------------------------------
export function BrandMark({ size = 48 }: { size?: number }) {
  return (
    <div style={{ width: size, height: size, position: 'relative', flexShrink: 0 }}>
      <div style={{
        position: 'absolute', inset: 0, borderRadius: '50%',
        background: 'linear-gradient(180deg, var(--accent) 0 50%, var(--surface) 50% 100%)',
        border: '3px solid var(--line)',
        boxShadow: 'inset 0 0 0 2px var(--line-soft), 0 3px 0 var(--shadow)',
      }} />
      <div style={{
        position: 'absolute', left: '50%', top: '50%',
        width: size * 0.32, height: size * 0.32,
        marginLeft: -(size * 0.16), marginTop: -(size * 0.16),
        borderRadius: '50%', background: 'var(--surface)', border: '3px solid var(--line)',
        boxShadow: 'inset 0 0 0 2px var(--line-soft)',
      }} />
    </div>
  );
}

// ---------- TitleBar --------------------------------------------------------
interface TitleBarProps { step?: number; }
export function TitleBar({ step }: TitleBarProps) {
  const steps = [1, 2, 3, 4];
  return (
    <div className="titlebar">
      <div className="titlebar__brand">
        <div className="titlebar__brand-mark" />
        <span>POCKET BATTLES</span>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        {steps.map(s => (
          <span key={s} className={`titlebar__dot${step !== undefined && s <= step ? ' titlebar__dot--on' : ''}`} />
        ))}
      </div>
    </div>
  );
}
