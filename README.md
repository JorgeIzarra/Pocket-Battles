# Pocket Battles

Juego de batallas por turnos 1 vs 1 en tiempo real. Dos jugadores se unen a una sala con código, arman su equipo de hasta 6 criaturas con 4 movimientos cada una, y combaten turno a turno hasta que uno de los dos equipos queda debilitado.

Proyecto individual — Curso: Desarrollo de Software.

---

## Stack y arquitectura

| Capa | Tecnología |
|------|-----------|
| Frontend | TanStack Start (React SSR) + Vite · puerto 3000 |
| Backend | Bun + Hono · puerto 3001 |
| Base de datos | MongoDB 7 + Mongoose |
| Infraestructura | Docker Compose |
| Motor de batalla | `@pocket-battles/battle-engine` (paquete interno, TS puro) |

```
┌─────────────────────────────────────────────────────────────────┐
│  Navegador (dos tabs / dos máquinas)                            │
│                                                                 │
│   TanStack Start :3000                                          │
│   ┌──────────────────────────────────────────────────────────┐  │
│   │  / → lobby → team → battle                              │  │
│   │  useBattleState (EventSource SSE)                        │  │
│   │  lib/api.ts (fetch POST para acciones)                   │  │
│   └──────────────┬──────────────────────────────────────────┘  │
│                  │  HTTP / SSE                                  │
│   Hono API :3001 ▼                                             │
│   ┌──────────────────────────────────────────────────────────┐  │
│   │  /rooms  →  roomService.ts                              │  │
│   │  /battle →  battleService.ts                            │  │
│   │  /catalog → catalog.ts                                  │  │
│   │               │                                         │  │
│   │  packages/battle-engine  (resolveTurn, calcDamage…)     │  │
│   │               │                                         │  │
│   │            MongoDB :27017                               │  │
│   │  Pokemon · Move · TypeChart · Room · Battle             │  │
│   └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

**Comunicación en tiempo real:** SSE (`EventSource`). Tras cada turno resuelto, el backend emite el `BattleState` completo por `GET /battle/:code/stream`. El frontend nunca calcula daño.

---

## Requisitos previos

- Docker Desktop ≥ 4.x con Docker Compose v2
- Conexión a Internet para el seed (descarga datos de PokéAPI la primera vez)

---

## Cómo correr el proyecto

```bash
# 1. Levantar los tres servicios (mongo + api + web)
docker compose up --build -d

# 2. Importar el catálogo desde PokéAPI  (~3-5 min la primera vez)
docker compose run --rm api bun run seed

# 3. Abrir la app en el navegador
#    http://localhost:3000
```

El seed es **idempotente**: si falla o se re-ejecuta, limpia las colecciones y vuelve a importar desde cero.

---

## Reglas implementadas en el motor

### Fórmula de daño

```
damage = floor(floor((2 × nivel / 5 + 2) × power × Atk / Def) / 50 + 2)
       × STAB × efectividad × crítico × variación × quemadura
```

- **Nivel fijo:** 50 para todas las criaturas.
- **STAB:** ×1.5 si el tipo del movimiento coincide con uno de los tipos del atacante.
- **Efectividad:** calculada desde la TypeChart cargada de PokéAPI (×0, ×0.5, ×1, ×2, ×4).
- **Crítico:** probabilidad 1/24; multiplicador ×1.5.
- **Variación aleatoria:** factor entre 0.85 y 1.0.
- **Quemadura:** ×0.5 al daño físico si el atacante tiene el estado `burn`.

### Estados de alteración

Soportados: `poison` · `burn` · `paralysis` · `atk_down` · `def_down` · `spe_down`

- Duración exacta: **3 turnos**.
- No apilables: un estado activo no puede ser sobreescrito por otro.
- Se eliminan al cambiar de criatura activa.
- Daño por turno (veneno/quemadura): `floor(maxHp × 0.05)` al final de cada turno.

### Orden de turno

1. Los cambios de criatura siempre van antes que los movimientos.
2. Entre movimientos: mayor `priority` (campo de PokéAPI) actúa primero.
3. Empate de prioridad: mayor velocidad actúa primero.
4. Empate de velocidad: orden aleatorio 50/50.

### Condición de victoria

Cuando todos los Pokémon de un equipo llegan a 0 HP, la batalla termina. El documento `Battle` pasa a `status: 'finished'` y se emite por SSE. El overlay de victoria/derrota se muestra en ambos clientes de forma simultánea.

---

## Fuente de datos

Todos los datos (tipos, movimientos, estadísticas base, TypeChart, sprites) provienen de **[PokéAPI](https://pokeapi.co)**. El seed descarga y persiste en MongoDB:

- ~1025 criaturas descargadas → filtradas a **formas finales de evolución** + legendarios/míticos con ≥ 4 movimientos usables → **300+ criaturas** disponibles en el catálogo.
- 18 tipos y la TypeChart completa.
- Sprite frontal (`sprites.front_default`) y trasero (`sprites.back_default`) por criatura; si `back_default` es null (unas ~150 criaturas Gen 6+), se usa `front_default` como fallback.

---

## Decisiones de diseño

- **Motor como paquete separado (`packages/battle-engine`):** lógica pura sin I/O, testeable de forma independiente con `bun test`. El backend lo importa; el frontend nunca lo toca. Esto garantiza que el cálculo de daño y estados es correcto independientemente de la UI.
- **`apps/web` excluido del workspace de Bun:** `@tanstack/react-start@1.168.6` depende internamente de `@tanstack/react-router@1.170.4`. El caché global de Bun hoistea versiones incompatibles entre sub-paquetes. Solución: `apps/web` usa npm con `--legacy-peer-deps` de forma aislada del workspace.
- **SSE sobre WebSocket:** el estado de batalla es de servidor a cliente y append-only por turno. SSE es más simple, no requiere librería adicional, y `EventSource` es nativo en el navegador. Las acciones del jugador van por `POST` normal.
- **`Battle` schema usa tipo `Mixed` para `players`:** permite serializar el `BattleState` completo del motor (con sprites, stages, IVs, movimientos) sin definir un subdocument rígido en Mongoose. Facilita evolucionar el modelo sin migraciones destructivas.

---

## Limitaciones conocidas

- Sin persistencia de sesión entre recargas: el `playerId` vive en `sessionStorage`; si se recarga la página en mitad de una batalla, se pierde la referencia.
- Una sola batalla activa por sala. Para regresar a la misma sala hay que crear una nueva.
- El seed puede tardar 3-5 minutos por el volumen de peticiones a PokéAPI (~1000 endpoints).
- Cuando ambos Pokémon activos caen a 0 HP en el mismo tick de estados de fin de turno (caso raro: ambos con veneno/quemadura y exactamente en el umbral del 5% de HP máximo), los selectores de reemplazo se abren simultáneamente en ambos clientes en vez de secuencialmente. Decisión de diseño: el motor resuelve turnos completos por lote para mantener la simplicidad. No afecta la integridad del juego.
