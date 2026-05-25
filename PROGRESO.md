# PROGRESO.md — Pocket Battles

Estado del proyecto día a día. Actualizar al terminar cada jornada.

---

## DÍA 1 — Infraestructura base ✅ COMPLETO

**Fecha:** completado sesión inicial  
**Commit:** `da199f8`

### Qué se construyó
- Monorepo Bun con workspaces (`apps/*`, `packages/*`)
- `docker-compose.yml` con 3 servicios: `mongo`, `api`, `web`
- Modelos Mongoose: `Pokemon`, `Move`, `TypeChart`, `Room`, `Battle`
- Script de seed `apps/api/src/seed/importPokeApi.ts`

### Resultado verificado
```bash
docker compose up -d
docker compose run --rm api bun run seed
# → 543 Pokémon en MongoDB, 18 tipos, TypeChart construida
```

### Decisiones de diseño
- Solo formas finales de evolución + legendarios/míticos en el catálogo
- TypeChart cargada desde PokéAPI (no hardcodeada)
- Sprite único: `sprites.front_default` de PokéAPI
- Pokémon con < 4 movimientos usables son excluidos del catálogo

---

## DÍA 2 — Motor de batalla (`battle-engine`) ✅ COMPLETO

**Fecha:** completado sesión 2  
**Commit:** `950cd5f`

### Qué se construyó
Paquete `@pocket-battles/battle-engine` — lógica pura, sin DB ni HTTP.

| Archivo | Contenido |
|---|---|
| `src/types.ts` | Interfaces: `BattleState`, `BattlePokemon`, `BattleMove`, `PlayerAction`, `StatusEffect`, `TypeChart`, `LogEntry` |
| `src/rng.ts` | `realRng` (Math.random) + `fixedRng` (determinista para tests) |
| `src/stats.ts` | `calcHp`, `calcStat`, `stageMultiplier`, `effectiveStat` — nivel fijo 50 |
| `src/damage.ts` | `calcDamage` (precisión → base → tipo → STAB → crítico → quemadura) + `getTypeMultiplier` |
| `src/status.ts` | `applyStatus`, `applyEndOfTurnStatusDamage`, `tickStatus`, `clearStatusAndStages` — duración 3 turnos |
| `src/turn.ts` | `resolveTurn`: ordena por prioridad/velocidad, ejecuta acciones, daño EOT, victoria |
| `src/index.ts` | Re-exporta toda la API pública |

### Resultado verificado
```bash
cd packages/battle-engine && bun test
# → 22/22 tests pasan, 0 fallos
```

### Tests cubiertos
- `damage.test.ts`: efectividad x4, inmunidad (damage=0), STAB (1.5×), movimientos de estado
- `status.test.ts`: duración 3 turnos (5% HP/turno), no apilamiento, `clearStatusAndStages`
- `turn.test.ts`: orden por velocidad, switch antes que move, victoria, inmutabilidad del estado

---

## DÍA 3 — API de salas ✅ COMPLETO

**Fecha:** sesión 3  
**Commit:** pendiente

### Qué se construyó

| Archivo | Acción |
|---|---|
| `apps/api/src/models/Room.ts` | Actualizado: campo `pendingTeam` (Mixed) en subdoc de jugador |
| `apps/api/src/services/roomService.ts` | **Nuevo** — toda la lógica de negocio de salas |
| `apps/api/src/routes/rooms.ts` | **Nuevo** — 5 rutas Hono |
| `apps/api/src/index.ts` | Actualizado: registra el router `/rooms` |

### Endpoints implementados

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/rooms` | Crea sala; devuelve `{ code, playerId }` |
| `POST` | `/rooms/:code/join` | Segundo jugador se une; devuelve `{ playerId }` |
| `GET` | `/rooms/:code` | Estado del lobby: quién está, si está listo |
| `POST` | `/rooms/:code/team` | Envía equipo armado con validación de moveset |
| `POST` | `/rooms/:code/start` | Inicia partida; crea documento `Battle` en MongoDB |

### Validaciones implementadas (sección 8.5)
- Exactamente 4 movimientos por Pokémon
- Sin movimientos repetidos
- Todos los moveIds pertenecen al Pokémon (en `damagingMoveIds` o `statusMoveIds`)
- Al menos un movimiento ofensivo (evita partidas infinitas)
- Equipo: 1–6 Pokémon
- Sala existe, status correcto, jugador pertenece a la sala

### Flujo de `POST /rooms/:code/start`
1. Valida que ambos jugadores tienen `ready: true`
2. Bulk-fetch de todos los Pokémon y movimientos del equipo en una sola query
3. Genera IVs aleatorios (0–31) por Pokémon
4. Calcula `battleStats` con `calcHp`/`calcStat` del engine
5. Construye `BattlePokemon[]` para cada jugador
6. Copia `TypeChart` desde MongoDB
7. Crea documento `Battle` + actualiza Room a `in_battle` en paralelo

### Cómo verificar con curl
```bash
# 1. Levantar MongoDB (si no está corriendo)
docker compose up -d mongo

# 2. Iniciar la API (en otro terminal)
cd apps/api && bun run dev

# 3. Crear sala
curl -s -X POST localhost:3001/rooms \
  -H "Content-Type: application/json" \
  -d '{"playerName":"Jorge"}' | jq .
# → {"code":"XXXXX","playerId":"uuid-1"}

# 4. Unirse (con el código del paso anterior)
curl -s -X POST localhost:3001/rooms/XXXXX/join \
  -H "Content-Type: application/json" \
  -d '{"playerName":"Ana"}' | jq .
# → {"playerId":"uuid-2"}

# 5. Estado del lobby
curl -s localhost:3001/rooms/XXXXX | jq .
# → {"code":"XXXXX","status":"ready","players":[{"name":"Jorge","ready":false},{"name":"Ana","ready":false}]}

# 6. Buscar un Pokémon y sus movimientos en MongoDB para armar el team
docker exec pocket-battles-mongo-1 mongosh pocket_battles --eval \
  "let p = db.pokemons.findOne({name:'charizard'}); print(p._id, p.damagingMoveIds.slice(0,4))"

# 7. Enviar equipo de cada jugador (4 moveIds reales del Pokémon elegido)
curl -s -X POST localhost:3001/rooms/XXXXX/team \
  -H "Content-Type: application/json" \
  -d '{"playerId":"uuid-1","team":[{"pokemonId":"<_id>","moveIds":["flamethrower","earthquake","dragon-claw","air-slash"]}]}' | jq .

# 8. Iniciar partida
curl -s -X POST localhost:3001/rooms/XXXXX/start | jq .
# → {"code":"XXXXX"}

# 9. Verificar que Battle fue creado
docker exec pocket-battles-mongo-1 mongosh pocket_battles --eval \
  "printjson(db.battles.findOne({roomCode:'XXXXX'},{turn:1,status:1,winnerPlayerId:1,_id:0}))"
# → {turn:1, status:'active', winnerPlayerId:null}
```

---

## DÍA 4 — API de batalla ✅ COMPLETO

**Commit:** pendiente

### Qué se construyó

| Archivo | Acción |
|---|---|
| `apps/api/src/services/battleService.ts` | **Nuevo** — SSE registry + orquestador engine ↔ MongoDB |
| `apps/api/src/routes/battle.ts` | **Nuevo** — 3 endpoints de batalla |
| `apps/api/src/routes/catalog.ts` | **Nuevo** — 2 endpoints de catálogo |
| `apps/api/src/index.ts` | Actualizado — registra `/battle` y `/catalog` |

### Endpoints implementados

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/battle/:code/action` | Jugador envía decisión; si hay 2 acciones, resuelve el turno |
| `GET` | `/battle/:code/state` | Estado completo de la batalla (carga inicial / plan B) |
| `GET` | `/battle/:code/stream` | SSE — estado nuevo tras cada turno resuelto |
| `GET` | `/catalog/pokemon` | Lista paginada; filtros `?name=` y `?type=` |
| `GET` | `/catalog/pokemon/:id` | Detalle con moves poblados |

### Flujo del turno
1. P1 envía acción → `{ status: "waiting" }` (1 acción guardada con `$push`)
2. P2 envía acción → motor ejecuta `resolveTurn` → `Battle.replaceOne` → `broadcastSSE` → `{ status: "resolved", state: {...} }`
3. Clientes SSE reciben el estado nuevo automáticamente

### Validaciones de acción
- Jugador pertenece a la batalla
- Pokémon activo tiene HP > 0
- `move`: moveId pertenece al Pokémon activo
- `switch`: índice válido, Pokémon destino vivo, diferente al activo
- No actuar dos veces en el mismo turno

### SSE
- Registro global: `Map<roomCode, Set<ReadableStreamDefaultController>>`
- Al conectarse: entrega el estado actual inmediatamente (sin esperar el siguiente turno)
- Al desconectarse: limpia el controller del registro
- `X-Accel-Buffering: no` para compatibilidad con nginx

### Cómo verificar
```bash
# Estado de la batalla
curl localhost:3001/battle/XXXXX/state

# Turno completo (dos terminales)
curl -X POST localhost:3001/battle/XXXXX/action \
  -H "Content-Type: application/json" \
  -d '{"playerId":"uuid-1","type":"move","moveId":"flamethrower"}'
# → {"status":"waiting"}

curl -X POST localhost:3001/battle/XXXXX/action \
  -H "Content-Type: application/json" \
  -d '{"playerId":"uuid-2","type":"move","moveId":"surf"}'
# → {"status":"resolved","state":{...log con daño, tipo, crits...}}

# SSE
curl -N localhost:3001/battle/XXXXX/stream
# → data: {...estado completo...} (en tiempo real)

# Catálogo
curl "localhost:3001/catalog/pokemon?type=dragon&limit=5"
curl "localhost:3001/catalog/pokemon/6a0a45ad3d0ebf0c32408030"
```

## DÍA 5 — Frontend TanStack Start ✅ COMPLETO

**Commit:** `4707813` + `cf92c0f`

### Qué se construyó
- Port de las 4 pantallas: `/` (home), `/lobby/$code`, `/team/$code`, `/battle/$code`
- Hook `useBattleState` — SSE con `EventSource` → `BattleState` en React state
- `lib/api.ts` — cliente fetch hacia la API Hono
- **CORS** habilitado en la API para peticiones del frontend en desarrollo

### Bugs corregidos
- **Navegación prematura** en `team.$code.tsx`: polling `GET /rooms/:code` cada 1.5 s hasta `status === 'in_battle'` antes de navegar a batalla.
- **Hooks order violation** en `battle.$code.tsx`: `useState(0)` movido antes de todos los early returns.

### Decisión técnica clave
`apps/web` usa npm (no Bun) porque `@tanstack/react-start@1.168.6` requiere `@tanstack/react-router@1.170.4` internamente y el caché global de Bun hoistea versiones incompatibles. Documentado en NOTAS-DIA4.md.

---

## DÍA 6 — Animaciones, sprite trasero y README ✅ COMPLETO

**Fecha:** 2026-05-19

### Qué se construyó

#### Animaciones de batalla (`apps/web/app/styles/components.css`)
- `@keyframes enter` + `.enter` — 360ms slide-up con overshoot (se aplica al montar via `useState('enter')` en `AnimSprite`)
- `@keyframes attackRight` + `.attack-r` — 280ms lunge derecha (pokemon propio atacando)
- `@keyframes attackLeft` + `.attack-l` — 280ms lunge izquierda (pokemon rival atacando)
- `.shake` + `.flash` (ya existían) — usados para el defensor que recibe daño
- `.faint` (ya existía) — permanente, derivado de `currentHp === 0`
- `.hpbar__fill { transition: width 600ms }` (ya existía) — drenado animado de HP

#### Sprite de espalda para el Pokémon propio
- Renombrado `spriteUrl` → `spriteFrontUrl` + añadido `spriteBackUrl` en 13 archivos:
  - `packages/battle-engine/src/types.ts`
  - `packages/battle-engine/test/status.test.ts`, `damage.test.ts`, `turn.test.ts`
  - `apps/api/src/models/Pokemon.ts`
  - `apps/api/src/seed/importPokeApi.ts` (captura `back_default`; fallback a `front_default` si es null)
  - `apps/api/src/services/roomService.ts`
  - `apps/api/src/routes/catalog.ts`
  - `apps/web/app/hooks/useBattleState.ts`
  - `apps/web/app/lib/api.ts`
  - `apps/web/app/components/shared.tsx`
  - `apps/web/app/routes/team.$code.tsx`
  - `apps/web/app/routes/battle.$code.tsx`

#### `battle.$code.tsx` — lógica de animación
- `AnimSprite` — componente hijo con `useState(animClass || 'enter')` para enter sin flash
- `prevStateRef` + `useLayoutEffect` — diff del estado anterior vs nuevo para detectar qué Pokémon atacó y cuál recibió daño
- Secuencia: lunge atacante (atk-r / atk-l) → 480 ms → shake+flash en defensor
- Caso daño mutuo: skip de lunges, shake+flash directo en ambos
- Faint permanente derivado de `currentHp === 0` (no de estado de animación)
- `key={pokemon.pokemonId}` en los wrappers de sprite → remount limpio al cambiar criatura → `enter` se re-dispara
- `myTimeoutRef` / `oppTimeoutRef` — evita colisiones de timeouts entre turnos rápidos

#### README.md reescrito
- 8 secciones: descripción, stack + diagrama ASCII, prereqs, 3-step how-to-run, reglas implementadas (fórmula de daño, estados 3 turnos, orden de turno, victoria), fuente de datos, decisiones de diseño (4 bullets), limitaciones conocidas.

### Pendiente para el próximo seed
El seed debe re-ejecutarse para que `spriteFrontUrl` y `spriteBackUrl` queden en MongoDB:
```bash
docker compose run --rm api bun run seed
```
Las batallas existentes en MongoDB anterior al seed no tendrán `spriteBackUrl` — iniciar salas nuevas.

---

## BUG FIX — Cambio de Pokémon con activo debilitado ✅ RESUELTO

**Fecha:** 2026-05-21

### Bug reportado
Cuando el Pokémon activo llegaba a 0 HP, el jugador quedaba atascado: los botones de movimiento eran rechazados por el backend (correcto), pero el botón "Cambiar" no abría el selector.

### Causa raíz (dos bugs)

**Backend — `apps/api/src/services/battleService.ts`:**
La validación "activo debe estar vivo" se ejecutaba antes de distinguir si la acción era `move` o `switch`. Una acción `switch` con el activo a 0 HP era rechazada con 400, aunque sea la única acción válida en ese estado.

**Frontend — `apps/web/app/routes/battle.$code.tsx`:**
`canSwitch = alive.length > 1` calculaba los Pokémon vivos sin incluir al activo debilitado. Si quedaba exactamente 1 Pokémon vivo (el reemplazo), `alive.length = 1 → canSwitch = false` → botón "Cambiar" deshabilitado → clic sin efecto.

### Arreglo

| Archivo | Cambio |
|---|---|
| `battleService.ts` | Mover la validación "activo vivo" dentro del bloque `move`; el bloque `switch` solo valida índice válido, destino vivo y distinto del activo |
| `battle.$code.tsx` | `canSwitch` usa `team.some(alive && i !== activeIndex)` — correcto en ambos estados |
| `battle.$code.tsx` | Move buttons: `disabled` añade `|| myActive.currentHp === 0` |
| `battle.$code.tsx` | `useEffect` auto-abre `SwitchPanel` cuando `myActiveFainted && canSwitch && phase==='choose'` |
| `battle.$code.tsx` | `SwitchPanel` acepta prop `mandatory`: oculta "← VOLVER" y muestra "Tu Pokémon se debilitó. Elige un reemplazo." |

### Decisión de diseño documentada
El doble debilitamiento simultáneo por EOT (ambos activos envenenados al umbral exacto) abre ambos selectores en paralelo. Decisión consciente: el motor resuelve turnos completos por lote. Añadido a `README.md > Limitaciones conocidas`.

---

## T5 — Ritmo de batalla (animaciones secuenciales) ✅ COMPLETO

**Fecha:** 2026-05-21

### Qué se construyó

Sistema de animación secuencial por turno: en lugar de mostrar el estado final de golpe, el frontend reproduce los eventos del turno uno a uno con sus animaciones y líneas de log sincronizadas.

#### Motor (`packages/battle-engine`)

| Archivo | Cambio |
|---|---|
| `src/types.ts` | `LogEntry` +3 campos opcionales: `actorId?`, `targetId?`, `targetHpAfter?` |
| `src/turn.ts` | `applyMove`: usa objeto `useEntry` mutable; `actorId` siempre, `targetId`/`targetHpAfter` solo en golpe; `applySwitch`: `actorId: entering.pokemonId` |
| `src/status.ts` | `applyEndOfTurnStatusDamage`: añade `targetId` y `targetHpAfter` al log entry |

22/22 tests pasan sin cambios.

#### API (`apps/api`)

| Archivo | Cambio |
|---|---|
| `battleService.ts` | Captura `log` del engine; calcula `firstActorPlayerId`; payload SSE nuevo: `{ state, turnLog, firstActorPlayerId }` |
| `routes/battle.ts` | Frame inicial del stream usa mismo formato `{ state, turnLog: [], firstActorPlayerId: null }` |

#### Frontend (`apps/web`)

| Archivo | Cambio |
|---|---|
| `hooks/useBattleState.ts` | Nuevo tipo `TurnData`; parsea payload SSE; retorna `{ latestTurnData, error }` |
| `routes/battle.$code.tsx` | Sistema completo de animación secuencial (ver detalles) |

### Sistema de animación (`battle.$code.tsx`)

- **`buildAnimFrames(turnLog, myPokemonIds, finalState)`** — convierte el log del turno en `AnimFrame[]`:
  - Golpe con daño → frame lunge (480ms) + frame impacto con HP update + modifiers (620ms)
  - Golpe de estado (sin daño) → frame único con lunge (420ms)
  - Fallo → frame con lunge + texto de fallo (420ms)
  - Cambio de Pokémon → frame con activeIndex update (450ms)
  - EOT (veneno/quemadura) → frame con shake + HP update (800ms) — secuencial si ambos afectados
  - Texto plano (faint, recuperación, etc.) → 300ms

- **`runAnimFrames`** — ejecuta frames con `setTimeout`, cancela con `() => void`; mide con `performance.now()`

- **`displayState` + `displayLog`** — estado de render separado del SSE; se actualiza incrementalmente frame a frame; HP bars drenan con CSS transition durante cada frame

- **Fase `'animating'`** — botones de movimiento y cambio deshabilitados mientras anima

- **Visibilidad de pestaña** — `document.visibilitychange`: si pestaña oculta >3s durante animación, salta al estado final

### Tiempo medido (turno típico)

| Escenario | Duración teórica |
|---|---|
| 2 ataques con daño | 480+620+480+620 = **2200ms** |
| 2 ataques + 1 EOT | 2200+800 = **3000ms** |
| 2 ataques + 2 EOT | 2200+800+800 = **3800ms** |

Rango objetivo cumplido: 3–4 s para turno con EOT.

---

## DÍA 8 — Clerk básico ✅ COMPLETO

**Fecha:** 2026-05-23

### Qué se construyó

#### Paquetes instalados
- `@clerk/clerk-react` (npm, `apps/web`) — ClerkProvider, hooks, UserButton, SignInButton
- `@clerk/backend@3.4.13` (bun, `apps/api`) — `verifyToken` standalone + `createClerkClient`

#### Variables de entorno
- `apps/web/.env`: `VITE_CLERK_PUBLISHABLE_KEY`, `VITE_API_URL`
- `apps/api/.env`: `CLERK_SECRET_KEY`, `STRIPE_SECRET_KEY` (guardada para Día 10), `MONGO_URL`, `PORT`
- `.env.example` creado en `apps/web/`, `apps/api/` y raíz del repo

#### Backend (`apps/api`)

| Archivo | Acción |
|---|---|
| `src/types.ts` | **Nuevo** — `AppEnv` / `AppVariables` para tipado del contexto Hono |
| `src/middleware/auth.ts` | **Nuevo** — `optionalAuth` y `requireAuth` usando `verifyToken` standalone de `@clerk/backend@3.x` |
| `src/models/Room.ts` | `playerSchema` +campo `clerkUserId: { type: String, default: null }` |
| `src/services/roomService.ts` | `createRoom` y `joinRoom` aceptan `clerkUserId?: string \| null` opcional |
| `src/routes/rooms.ts` | `POST /rooms` y `POST /rooms/:code/join` usan `optionalAuth`; pasan `clerkUserId` al service |
| `src/routes/me.ts` | **Nuevo** — `GET /me` protegido por `requireAuth`; devuelve `{ userId, email }` |
| `src/index.ts` | Registra `/me`; `Hono<AppEnv>` tipado |

#### Frontend (`apps/web`)

| Archivo | Acción |
|---|---|
| `app/routes/__root.tsx` | `ClerkProvider` wrappea el cuerpo (no `<html>` ni `<Scripts>`) |
| `app/lib/api.ts` | `createRoom` y `joinRoom` aceptan `token?`; añade `Authorization: Bearer` header. Nuevo `getMe()` |
| `app/routes/index.tsx` | Dos modos: invitado (input de nombre + SignInButton) / autenticado (perfil Clerk + UserButton) |

#### Docker
- `apps/web/Dockerfile` reescrito: `node:22-slim`, `npm install`, ARGs para `VITE_*`, `npm run build`, `npm run start`
- `apps/web/vite.config.ts` +`preview: { port: 3000, host: true }` para Docker
- `docker-compose.yml` actualizado: `api` recibe `CLERK_SECRET_KEY`/`STRIPE_SECRET_KEY`; `web` recibe `VITE_*` como build args

### Decisión técnica: API de @clerk/backend 3.x

En `@clerk/backend@3.x`, `verifyToken` no es método del cliente (`ClerkClient.verifyToken` no existe). Es una exportación standalone:
```typescript
import { verifyToken, createClerkClient } from '@clerk/backend';
const payload = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY });
```
El `createClerkClient` se usa solo para `clerk.users.getUser(userId)` en el endpoint `/me`.

### Resultado verificado
```bash
# API health
curl http://localhost:3001/health           # → {"ok":true}

# GET /me sin token → 401
curl http://localhost:3001/me              # → HTTP 401
curl http://localhost:3001/me -H "Authorization: Bearer fake" # → {"error":"Unauthorized"}

# Modo invitado preservado
curl -X POST http://localhost:3001/rooms -H "Content-Type: application/json" \
  -d '{"playerName":"Ana"}'               # → {"code":"XXXXX","playerId":"uuid"}

# Web dev server
npm run dev (apps/web)                    # → HTTP 200 en /
```

### Verificar con usuario real (manual)
1. Abrir `http://localhost:3000` → pantalla de inicio con botón "INICIAR SESIÓN"
2. Clic → modal de Clerk → registrarse o iniciar sesión
3. Tras login: input de nombre desaparece, `<UserButton />` en esquina, nombre del perfil visible
4. CREAR SALA → `Room.players[0].clerkUserId` guardado en MongoDB
5. GET /me con token real → `{ userId, email }` correcto
6. Cerrar sesión → vuelve al modo invitado

---

## DÍA 9 — Avatares de entrenadores ✅ COMPLETO

**Fecha:** 2026-05-24

### Qué se construyó

#### Constantes compartidas
- `apps/api/src/lib/avatars.ts` — `VALID_AVATARS` + `AvatarId` (fuente de verdad del backend)
- `apps/web/app/lib/avatars.ts` — ídem para el frontend

#### Motor (`packages/battle-engine`)
- `src/types.ts` — añadido `avatarId?: string | null` (opcional) a `PlayerState`. Los 22 tests siguen pasando sin cambios.

#### Backend (`apps/api`)

| Archivo | Cambio |
|---|---|
| `src/models/Room.ts` | `playerSchema` +`avatarId: { type: String, default: null }` |
| `src/routes/me.ts` | +`POST /me/avatar` — valida `avatarId` en `VALID_AVATARS`, llama `clerk.users.updateUserMetadata` |
| `src/services/roomService.ts` | `createRoom` / `joinRoom` aceptan `avatarId?`; `getRoomState` expone `avatarId`; `startBattle` propaga `avatarId` a `PlayerState` de la batalla |
| `src/routes/rooms.ts` | `POST /rooms` y `POST /rooms/:code/join` leen `avatarId` del body |

#### Frontend (`apps/web`)

| Archivo | Cambio |
|---|---|
| `app/lib/api.ts` | `createRoom` / `joinRoom` envían `avatarId`; `RoomState.players` incluye `avatarId`; `setAvatar()` nuevo |
| `app/routes/select-avatar.tsx` | **Nueva ruta** — rejilla 4×2 de sprites, selección visual, llama `POST /me/avatar`, recarga user con `user.reload()` |
| `app/routes/index.tsx` | Guard `useEffect` → redirige a `/select-avatar` si `isSignedIn && !avatarId`; pasa `avatarId` a `createRoom` / `joinRoom` |
| `app/routes/lobby.$code.tsx` | `PlayerSlot` muestra `<img src=/avatars/X.png>` si `avatarId` existe, `TrainerSilhouette` si es null |
| `app/routes/battle.$code.tsx` | `NameTag` acepta `avatarId?`; muestra mini-sprite 18×18 junto al badge del nombre si existe |

#### README
- Nota sobre Dockerfile `node:22-slim` vs `oven/bun` en la sección de stack.

### Flujo verificable
1. Usuario nuevo se registra → `index.tsx` detecta `!avatarId` → redirige a `/select-avatar`
2. Elige sprite → clic CONFIRMAR → `POST /me/avatar` → `user.reload()` → vuelve a home sin bucle
3. Crear/unirse a sala → `avatarId` viaja en el body → se persiste en `Room.players[].avatarId`
4. Lobby: ambos jugadores ven el avatar del otro (via `getRoomState`)
5. `POST /rooms/:code/start` → `avatarId` en `PlayerState` → viaja en el `BattleState` por SSE
6. Batalla: `NameTag` muestra mini-avatar junto al nombre del jugador y del rival
7. Invitado (sin login): `avatarId = null` → `TrainerSilhouette` en lobby, solo texto en batalla

---

## DÍA 10 — Stripe básico ✅ COMPLETO

**Fecha:** 2026-05-24

### Qué se construyó

#### Paquetes instalados
- `stripe@22.1.1` (bun, `apps/api`) — SDK oficial de Stripe para Node/Bun
- `@stripe/stripe-js` (npm, `apps/web`) — instalado para requisito del proyecto

#### Variables de entorno
- `apps/api/.env`: +`STRIPE_PRICE_ID`, +`STRIPE_WEBHOOK_SECRET`
- `apps/web/.env`: +`VITE_STRIPE_PUBLISHABLE_KEY`
- Ambos `.env.example` actualizados con los nuevos nombres

#### Backend (`apps/api`)

| Archivo | Acción |
|---|---|
| `src/models/Subscription.ts` | **Nuevo** — colección MongoDB con `clerkUserId`, `status`, `stripeCustomerId`, `stripeSubscriptionId`, `currentPeriodEnd` |
| `src/routes/payments.ts` | **Nuevo** — `POST /payments/checkout-session` (requireAuth) y `POST /payments/webhook` (validación firma Stripe) |
| `src/routes/me.ts` | +`GET /me/subscription` (requireAuth) — devuelve `{ isPremium, status, currentPeriodEnd }` |
| `src/index.ts` | +`app.route('/payments', payments)` |

#### Frontend (`apps/web`)

| Archivo | Acción |
|---|---|
| `app/lib/api.ts` | +`createCheckoutSession()` y `getSubscription()` |
| `app/hooks/useSubscription.ts` | **Nuevo** — hook `{ isPremium, loading, refresh }` |
| `app/routes/index.tsx` | +botón "✨ POCKET BATTLES PREMIUM · $4.99/mes" (solo usuarios no-premium), +badge "✨ PREMIUM", +toast `?premium=success`, +`handlePremium` |

### Decisión técnica: raw body en Hono para webhook

El endpoint `POST /payments/webhook` usa `c.req.text()` antes de cualquier parsing.
Hono no tiene parser JSON global (el parsing es on-demand), por lo que basta con
leer el body como string raw antes de verificar la firma con `stripe.webhooks.constructEvent`.
No se necesita middleware especial ni excepción de CORS.

### Flujo verificable
1. Usuario logueado → clic "✨ POCKET BATTLES PREMIUM" → redirige a Stripe Checkout
2. Pago con tarjeta de prueba `4242 4242 4242 4242` → Stripe redirige a `?premium=success`
3. Frontend detecta query param → `refreshSub()` → badge "✨ PREMIUM" + toast
4. Backend recibió webhook `checkout.session.completed` → documento en `Subscription` con `status: 'active'`
5. `GET /me/subscription` devuelve `{ isPremium: true, status: 'active', ... }`
6. Usuario invitado: no ve el botón Premium, no puede llamar los endpoints (401)

### Para webhooks en local
```bash
stripe listen --forward-to localhost:3001/payments/webhook
# → imprime STRIPE_WEBHOOK_SECRET (whsec_...) → añadir a apps/api/.env
```

---

## BUG FIX — Webhook Stripe retornaba 400/500 → Premium no se activaba ✅ RESUELTO

**Fecha detectado:** 2026-05-24  
**Fecha resuelto:** 2026-05-25  
**Commit:** `9fb1c79`

### Síntoma
Tras pagar con tarjeta de prueba, el badge PREMIUM no aparecía. `GET /me/subscription` devolvía `{"isPremium":false}`. La colección `subscriptions` en MongoDB estaba vacía. Los logs de Stripe CLI mostraban `[400] POST /payments/webhook` en todos los intentos.

### Causa raíz — dos bugs en cadena

**Bug 1 — `constructEvent()` no funciona en Bun (sync vs async)**

Bun usa `SubtleCryptoProvider` (Web Crypto API) por defecto, que solo opera de forma asíncrona. `stripe.webhooks.constructEvent()` es síncrono e internamente llama a `computeHMACSignature()`, que en ese provider lanza:

```
SubtleCryptoProvider cannot be used in a synchronous context.
Use `await constructEventAsync(...)` instead of `constructEvent(...)`
```

Esto hacía que el `try/catch` capturara el error y devolviera 400 antes de procesar nada. El `STRIPE_WEBHOOK_SECRET` era correcto — el problema era puramente de runtime.

**Bug 2 — `sub.current_period_end` no existe en Stripe API `2026-04-22.dahlia`**

Una vez resuelto el Bug 1, el webhook empezaba a procesarse pero fallaba con 500:

```
CastError: Cast to date failed for value "Invalid Date" at path "currentPeriodEnd"
```

En Stripe API `2026-04-22.dahlia`, el campo `current_period_end` fue eliminado del objeto `Subscription` raíz y movido al nivel de ítem. `sub.current_period_end` devuelve `undefined`, lo que convierte `new Date(undefined * 1000)` en `Invalid Date`, que Mongoose rechaza al intentar guardar en el campo `Date` del schema.

El campo correcto en la nueva API es `sub.items.data[0].current_period_end`.

### Arreglo (`apps/api/src/routes/payments.ts`)

```diff
- event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET!);
+ event = await stripe.webhooks.constructEventAsync(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET!);

// en checkout.session.completed y customer.subscription.updated:
- currentPeriodEnd: new Date(sub.current_period_end * 1000),
+ currentPeriodEnd: new Date(sub.items.data[0].current_period_end * 1000),
```

### Resultado post-fix
- Stripe CLI muestra `[200]` en todos los eventos, incluido `checkout.session.completed`.
- MongoDB contiene documento en `subscriptions` con `status: "active"`.
- `GET /me/subscription` devuelve `{ isPremium: true, status: "active", currentPeriodEnd: ... }`.
- Badge PREMIUM visible en el home tras el pago.

---

## DÍA 11 — Sprites shiny + HomeScreen ✅ COMPLETO

**Fecha:** 2026-05-25

### Qué se construyó

#### Modelo y seed (`apps/api`)

| Archivo | Cambio |
|---|---|
| `src/models/Pokemon.ts` | +`spriteFrontShinyUrl: String`, +`spriteBackShinyUrl: String` |
| `src/seed/importPokeApi.ts` | Interfaz `RawPokemon` +2 campos; captura `pk.sprites.front_shiny` / `back_shiny`; fallback a `front_shiny` si `back_shiny` es null; contador `shinyBackFallbackCount` en resumen |

#### startBattle con Premium (`apps/api/src/services/roomService.ts`)

- Importa `Subscription`
- En `startBattle`, el `Promise.all` añade `Subscription.find({ clerkUserId: { $in: [...] }, status: 'active' })`
- Construye `premiumSet: Set<string>` con los `clerkUserId` de suscripciones activas
- Al construir cada `BattlePokemon`: si el jugador es premium, `spriteFrontUrl` y `spriteBackUrl` reciben las URLs shiny (con fallback a las normales si el campo shiny no está aún en DB)
- El motor **no se toca** — recibe `BattlePokemon` con URLs como strings, sin saber si son shiny

#### Team Select ✨ (`apps/web/app/routes/team.$code.tsx`)

- Usa `useSubscription()` para obtener `isPremium`
- En cada slot del equipo armado: si `entry` existe e `isPremium`, muestra `✨` (`position: absolute, bottom: 2, left: 4`) — decorativo, comunica "serán shiny en batalla"
- Rejilla del catálogo: sin cambios

#### HomeScreen reorganizada (`apps/web/app/routes/index.tsx`)

- Eliminado el `<div position: absolute>` que solapaba badge PREMIUM + UserButton con el label "ANFITRIÓN"
- Columna derecha cambiada de `display: grid, gridTemplateRows: 1fr 1fr` a `display: flex, flexDirection: column`
- **Session bar** nueva: fila flex-end al tope de la columna derecha — badge PREMIUM (izquierda) + UserButton / INICIAR SESIÓN (derecha), con gap claro
- Paneles CREAR y UNIRSE usan `flex: 1` para repartir el espacio restante (mismo efecto visual que antes)
- "ANFITRIÓN" / "INVITADO" permanecen dentro de sus paneles sin interferencia

### Fase auth/pagos: COMPLETA ✅

Los cuatro días de la fase (Días 8–11) están implementados y verificados:
- Día 8 ✅ Clerk básico (login opcional, modo invitado preservado)
- Día 9 ✅ Avatares de entrenadores
- Día 10 ✅ Stripe Premium + fix webhook
- Día 11 ✅ Sprites shiny + HomeScreen fix

### Verificación final

```bash
# Seed con imagen Docker actualizada
docker compose build api
docker compose run --rm api bun run seed

# Confirmar campos shiny en MongoDB
docker exec pocket-battles-mongo-1 mongosh pocket_battles --eval \
  "printjson(db.pokemons.findOne({name:'charizard'},{name:1,spriteFrontShinyUrl:1,spriteBackShinyUrl:1,_id:0}))"
# → { name: 'charizard', spriteFrontShinyUrl: '...shiny/6.png', spriteBackShinyUrl: '...back/shiny/6.png' }
```

---

## POST DÍA 11 — Bugs y pulido visual ✅ COMPLETO

**Fecha:** 2026-05-25

### Bugs corregidos

#### Bug 1 — Campos shiny ausentes en MongoDB

**Síntoma:** `spriteFrontShinyUrl` y `spriteBackShinyUrl` no aparecían en los documentos de Pokémon. `GET /me/subscription` devolvía premium pero los sprites en batalla eran normales.

**Causa raíz:** el seed se re-ejecutó con la imagen Docker anterior al Día 11. Los cambios en `importPokeApi.ts` y `Pokemon.ts` existían en disco pero no en el contenedor (imagen sin rebuild).

**Fix:**
```bash
docker compose build api          # reconstruir imagen con código nuevo
docker compose run --rm api bun run seed  # re-poblar con campos shiny
```

**Verificación:** `spriteFrontShinyUrl` y `spriteBackShinyUrl` presentes en todos los documentos.

#### Bug 2 — Sprite del jugador salía de frente en batalla (premium)

**Síntoma:** el Pokémon del jugador premium aparecía de frente en lugar de de espaldas.

**Causa raíz:** misma que Bug 1. Sin los campos shiny en DB, el fallback en `startBattle` asignaba `normalFront` tanto a `spriteFrontUrl` como a `spriteBackUrl` del jugador premium. El frontend (`battle.$code.tsx:459`) mostraba `spriteBackUrl` que contenía la URL del sprite frontal.

**Fix:** el rebuild del seed resuelve el problema. El código de `roomService.ts` y `battle.$code.tsx` era correcto.

**Verificado:** sprite de espalda shiny (colores alternativos) en batalla para usuario premium ✓

### Pulido visual — Team Select

| Cambio | Archivo | Detalle |
|---|---|---|
| Catálogo: 4 columnas fijas con altura uniforme | `team.$code.tsx` | `repeat(4, 1fr)` + `gridAutoRows: '190px'` — todas las tarjetas tienen la misma altura |
| Panel derecho más amplio | `team.$code.tsx` | `326px → 380px` — más espacio para slots y lista de movimientos |
| Slots del equipo: 2 columnas | `team.$code.tsx` | `repeat(3, 1fr) → repeat(2, 1fr)` — slots más anchos y cómodos |
| Borde dorado en slots premium | `team.$code.tsx` | `border: #f0c040` cuando el slot tiene Pokémon e `isPremium` |
| ✨ más grande y centrado | `team.$code.tsx` | `fontSize: 10 → 16`, centrado horizontalmente en la base del slot |
| Sprite de catálogo más grande | `shared.tsx` | `64px → 80px` — mejor proporción en el ancho de 4 columnas |
| Tinte de tipo en fondo de sprite | `shared.tsx` | `linear-gradient` con `typeColor(types[0])` al 13% de opacidad — identidad visual por tipo |

### Estado final verificado

- **Premium en batalla:** Pokémon propio de espaldas en variante shiny ✓
- **No-premium en batalla:** Pokémon propio de espaldas en variante normal ✓
- **Team Select premium:** borde dorado + ✨ centrado y visible en cada slot ocupado ✓
- **Team Select catálogo:** 4 columnas uniformes, tarjetas de 190px con sprites de 80px y fondo por tipo ✓
- **Sin scroll de página:** todo cabe en viewport 1280×800 ✓

---

## DÍA 7 — Ensayo de demo (pendiente)

- `docker compose up --build` desde cero en máquina limpia
- Ejecutar seed y verificar ≥ 300 Pokémon
- Partida completa con 2 navegadores: crear sala → unirse → armar equipo → batalla → victoria
- Verificar animaciones secuenciales T5: lunge → shake+flash → HP drain → log sincronizado
- Verificar EOT secuencial con dos envenenados
- Verificar skip por visibilidad de pestaña
- Medir tiempo real en consola (`[T5] animation Xms`)
