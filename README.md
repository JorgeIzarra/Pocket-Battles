# Pocket Battles

Simulador de batallas 1v1 por turnos y salas con código.
Proyecto individual — Curso: Desarrollo de Software.

---

## Stack

| Capa | Tecnología |
|---|---|
| Runtime | Bun |
| Backend API | Hono (puerto 3001) |
| Frontend | TanStack Start (puerto 3000) |
| Base de datos | MongoDB 7 |
| Orquestación | Docker Compose |

Monorepo con workspaces de Bun: `apps/api`, `apps/web`, `packages/battle-engine`.

---

## Cómo levantar el proyecto

### Requisitos previos

- Docker Desktop instalado y corriendo
- (Opcional para desarrollo local) Bun >= 1.x

### 1. Clonar e instalar dependencias

```bash
git clone <repo>
cd pocket-battles
bun install
```

### 2. Levantar los servicios

```bash
docker compose up -d
```

Esto levanta tres servicios: `mongo`, `api`, `web`.

### 3. Correr el seed (una sola vez)

```bash
docker compose run --rm api bun run seed
```

El seed descarga desde PokéAPI y persiste en MongoDB:
- La TypeChart con las 18 relaciones de daño entre tipos
- 300+ Pokémon (formas finales + legendarios/míticos) con stats, sprites y movimientos
- Todos los movimientos usables clasificados

Tiempo estimado: **2-5 minutos** (depende de la conexión).

### 4. Verificar

```bash
# Contar Pokémon en la base
docker exec -it pocket-battles-mongo-1 mongosh pocket_battles \
  --eval "db.pokemons.countDocuments({})"

# Spot-check
docker exec -it pocket-battles-mongo-1 mongosh pocket_battles \
  --eval "db.pokemons.findOne({name:'charizard'}, {name:1, types:1, baseStats:1})"
```

### 5. Abrir la app

- Frontend: http://localhost:3000
- API health: http://localhost:3001/health

---

## Fuente de datos

Todos los datos provienen de **[PokéAPI v2](https://pokeapi.co/docs/v2)**.
No hay datos hardcodeados en el código fuente.

| Endpoint | Uso |
|---|---|
| `/pokemon?limit=1025` | Lista de Pokémon |
| `/pokemon/{id}` | Stats, tipos, sprite, movimientos |
| `/pokemon-species/{id}` | Legendario/mítico, cadena evolutiva |
| `/evolution-chain/{id}` | Determinar forma final de evolución |
| `/move/{id}` | Poder, precisión, prioridad, categoría, efectos |
| `/type/{id}` | Relaciones de daño entre tipos |

---

## Decisiones de diseño del catálogo

### Filtro: formas finales + legendarios

El catálogo incluye solo Pokémon en su **forma máxima de evolución** o que sean
**legendarios / míticos**. Esto hace el simulador más equilibrado (no hay
Caterpie peleando contra Dragonite) y simplifica el catálogo.

Implementación: se recorren todas las cadenas evolutivas de PokéAPI. Un nodo
sin `evolves_to` es forma final. Las formas parciales (Caterpie, Metapod, etc.)
quedan excluidas.

### Exclusión por menos de 4 movimientos

Un Pokémon que no tenga al menos 4 movimientos usables en total (ofensivos +
de estado soportados) se excluye del catálogo. Sin esto no podría armarse un
equipo válido para él.

### Movimiento ofensivo obligatorio en equipo

Al armar el equipo para una batalla, cada Pokémon debe tener al menos 1 de sus
4 movimientos elegidos con `power > 0`. Sin esta regla, un equipo de puros
movimientos de estado no tendría forma de ganar.

### Movimientos de estado soportados

El motor soporta: `poison`, `burn`, `paralysis`, `atk_down`, `def_down`,
`spe_down`. Cualquier otro estado de PokéAPI (sueño, confusión, congelado, etc.)
se descarta silenciosamente en el seed.

### SSE en lugar de WebSocket

El estado en vivo de la batalla llega por SSE (`EventSource`). Las acciones
del jugador van por `POST` normal. Esto es más simple de implementar en Hono
y suficientemente robusto para la demo.

---

## Motor de batalla

El motor (`packages/battle-engine`) es lógica pura: recibe el estado de la
batalla y devuelve el estado nuevo. **No toca la base de datos ni HTTP.**
`battleService.ts` en el API es el único puente entre el motor y MongoDB.

El frontend **nunca calcula daño**. Solo envía decisiones y pinta el estado
que el backend devuelve.

---

## Estructura del repositorio

```
pocket-battles/
├── docker-compose.yml
├── packages/
│   └── battle-engine/          # Motor puro (sin DB ni HTTP)
└── apps/
    ├── api/                    # Hono API (puerto 3001)
    │   └── src/
    │       ├── models/         # Mongoose: Pokemon, Move, TypeChart, Room, Battle
    │       ├── routes/         # catalog, rooms, battle
    │       ├── services/       # roomService, battleService
    │       └── seed/
    │           └── importPokeApi.ts
    └── web/                    # TanStack Start frontend (puerto 3000)
```

---

## Limitaciones conocidas

- El seed tarda varios minutos por el volumen de peticiones a PokéAPI.
- La conexión SSE no persiste si se refresca el navegador (plan B: reabrir la URL).
- El campo "objetos" y el sistema de clima son opcionales y no están implementados.
