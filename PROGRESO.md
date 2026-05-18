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

## DÍA 4 — API de batalla (pendiente)

- `routes/battle.ts`: `POST /battle/:code/action`, `GET /battle/:code/state`, `GET /battle/:code/stream` (SSE)
- `services/battleService.ts`: orquestador engine ↔ MongoDB, emisión SSE
- `routes/catalog.ts`: `GET /catalog/pokemon`, `GET /catalog/pokemon/:id`

## DÍA 5 — Frontend TanStack Start (pendiente)

- Port de las 4 pantallas del handoff a TSX real
- Hooks: `useBattleState` (SSE), `useRoom` (polling)
- `lib/api.ts`: cliente fetch hacia la API Hono

## DÍA 6 — Animaciones y README (pendiente)

- Animaciones: `.shake`, `.flash`, `.faint`, barra de vida
- `README.md` completo: instrucciones, decisiones de diseño, cómo correr

## DÍA 7 — Ensayo de demo (pendiente)

- `docker compose up` desde cero
- Partida completa con 2 navegadores
- Verificar todos los puntos del checklist de la demo (CONTEXT.md sección 11.2)
