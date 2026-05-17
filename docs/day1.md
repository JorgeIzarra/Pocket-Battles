# Día 1 — Monorepo, Docker Compose y Seed de PokéAPI

## Objetivo del día
Levantar la infraestructura base del proyecto y poblar MongoDB con 300+ Pokémon
importados desde PokéAPI, con el filtro de formas finales de evolución + legendarios.

**Resultado verificable:** `docker compose up` levanta; tras correr el seed
hay ≥ 300 Pokémon en MongoDB.

---

## Lo que se construyó

### 1. Monorepo con workspaces de Bun

```
pocket-battles/
├── package.json                 # workspaces: ["apps/*", "packages/*"]
├── docker-compose.yml
├── README.md
├── packages/
│   └── battle-engine/           # stub — se implementa el Día 2
└── apps/
    ├── api/                     # Hono + MongoDB (puerto 3001)
    └── web/                     # TanStack Start (puerto 3000, stub)
```

El monorepo usa workspaces de Bun, lo que permite que `apps/api` importe
`@pocket-battles/battle-engine` como dependencia local sin publicarlo.

### 2. Docker Compose — 3 servicios

| Servicio | Imagen / build | Puerto | Rol |
|---|---|---|---|
| `mongo` | `mongo:7` | 27017 | Base de datos |
| `api` | `./apps/api/Dockerfile` | 3001 | Hono API + seed |
| `web` | `./apps/web/Dockerfile` | 3000 | Frontend (stub) |

Los Dockerfiles de `api` y `web` usan **la raíz del monorepo como contexto de build**
(`context: .` en docker-compose.yml) para que `bun install` resuelva correctamente
los workspaces internos.

### 3. Modelos Mongoose

Se crearon 5 colecciones en MongoDB:

| Colección | Propósito |
|---|---|
| `pokemons` | Catálogo importado: stats, tipos, sprite, movimientos |
| `moves` | Movimientos con poder, precisión, categoría de daño, estado |
| `typecharts` | Tabla de efectividad entre tipos (obtenida de PokéAPI) |
| `rooms` | Salas de batalla 1v1 (se usa en Día 3) |
| `battles` | Estado vivo de cada partida (se usa en Día 4) |

### 4. Script de seed: `importPokeApi.ts`

**Ruta:** `apps/api/src/seed/importPokeApi.ts`
**Comando:** `docker compose run --rm api bun run seed`

#### Algoritmo en 5 pasos

1. **TypeChart** — descarga los 18 tipos de PokéAPI y construye la tabla
   `chart[tipoAtacante][tipoDefensor] = multiplicador` (2 / 0.5 / 0 / 1).
   Se guarda en la colección `typecharts`.

2. **Lista de Pokémon** — descarga los primeros 1025 Pokémon de PokéAPI.
   Para cada uno obtiene en paralelo:
   - `/pokemon/{id}` → stats base, tipos, sprite, lista de movimientos
   - `/pokemon-species/{id}` → `is_legendary`, `is_mythical`, URL de la cadena evolutiva

3. **Set de formas finales** — deduplicación de URLs de cadenas evolutivas y
   recorrido en profundidad de cada cadena. Un nodo sin `evolves_to` es forma final.

4. **Filtro** — se conserva un Pokémon si cumple:
   - `sprites.front_default !== null` (tiene sprite disponible)
   - Es forma final de evolución **O** es legendario / mítico

5. **Movimientos** — se recopilan todos los nombres de movimientos únicos de los
   Pokémon filtrados y se descarga el detalle de cada uno **una sola vez**.
   Clasificación por Pokémon:
   - `power > 0` → `damagingMoveIds`
   - `damageClass === 'status'` con efecto soportado → `statusMoveIds`
   - Cualquier otro → descartado
   - Si el total < 4 → el Pokémon se excluye del catálogo

#### Control de concurrencia

Todas las fases usan un helper `mapWithConcurrency` con **10 peticiones
simultáneas**. PokéAPI no tiene rate limit duro pero saturar cientos de
conexiones simultáneas puede causar errores; con 10 el seed completa en
2-5 minutos con resultados estables.

#### Idempotencia

El seed empieza con `deleteMany({})` en las tres colecciones (`pokemons`,
`moves`, `typecharts`). Puede correrse múltiples veces sin duplicar datos.

---

## Decisiones de diseño documentadas

### ¿Por qué solo formas finales + legendarios?
Un catálogo de 1025 Pokémon sin filtrar incluye formas parciales (Caterpie,
Metapod, Kakuna…) que hacen el simulador desequilibrado y menos divertido.
Filtrar a formas finales garantiza Pokémon en su estado máximo. Los legendarios
y míticos se incluyen explícitamente porque son los Pokémon más icónicos para
una demo aunque no tengan evolución posterior.

### ¿Por qué `limit=1025` y no `limit=300`?
Con `limit=300` el filtro de formas finales puede dejar menos de 300 Pokémon.
Con 1025 entradas hay margen amplio; el filtro termina con ~380-450 Pokémon
dependiendo de la versión de PokéAPI.

### Efectividad de tipos desde PokéAPI, no hardcodeada
La TypeChart se construye dinámicamente desde el endpoint `/type/{id}`.
Esto cumple el requisito de la rúbrica y hace el motor robusto ante cambios
de generación.

---

## Verificación del Día 1

```bash
# Levantar
docker compose up -d

# Seed
docker compose run --rm api bun run seed

# Contar Pokémon
docker exec pocket-battles-mongo-1 mongosh pocket_battles \
  --eval "print('Pokemons:', db.pokemons.countDocuments({}))"

# Verificar TypeChart
docker exec pocket-battles-mongo-1 mongosh pocket_battles \
  --eval "print('Tipos:', Object.keys(db.typecharts.findOne().chart).length)"

# Spot-check
docker exec pocket-battles-mongo-1 mongosh pocket_battles \
  --eval "printjson(db.pokemons.findOne({name:'charizard'},{name:1,types:1,baseStats:1,_id:0}))"
```

**Resultado esperado:**
- `Pokemons: ≥ 300`
- `Tipos: 18`
- Charizard con `types: ["fire","flying"]` y stats completos

---

## Próximo paso — Día 2

Implementar `packages/battle-engine` completo:
- `types.ts`, `rng.ts`, `stats.ts`, `damage.ts`, `status.ts`, `turn.ts`
- Tests con `bun test`: efectividad x4, STAB, estado de 3 turnos, victoria
