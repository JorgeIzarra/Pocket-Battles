# NOTAS DÍA 4-5 — Problemas de compatibilidad TanStack Start

> Escrito al cierre de la sesión. Estado final: **frontend funcionando**.  
> Este documento existe para que la próxima sesión no repita los callejones sin salida.

---

## 1. El problema original

Al intentar levantar el servidor de desarrollo de `apps/web` con TanStack Start, apareció este error:

```
SyntaxError: The requested module '@tanstack/router-generator' does not provide
an export named 'startAPIRouteSegmentsFromTSRFilePath'
```

**Versiones involucradas en el momento del error:**
- `@tanstack/start@1.120.20` (la versión instalada originalmente, paquete ya deprecated)
- `@tanstack/router-generator@1.167.5` (en la caché global de Bun)
- El problema: Bun tenía en caché una versión de `router-generator` que no exportaba la función que `@tanstack/start@1.120.20` necesitaba.

**Por qué sucedió:** El ecosistema TanStack tuvo un cambio de paquete sin bump de versión mayor:
- `@tanstack/start` existe hasta `1.120.20` (deprecated)
- El paquete nuevo se llama `@tanstack/react-start` (desde `1.167.x` en adelante)
- Las versiones de los paquetes internos (router-generator, router-plugin, etc.) no son coherentes entre sí en `^semver`

---

## 2. Lo que se intentó y NO funcionó

### Callejón 1: Usar Bun + workspace + `@tanstack/start@1.120.20`
Intentar fijar versiones de `@tanstack/router-generator` a `1.120.20` explícitamente.  
**Por qué falló:** El caché global de Bun hoistea paquetes y distintos sub-paquetes de `@tanstack/start` necesitan versiones *incompatibles entre sí* de `router-generator`. No existe una única versión que satisfaga todos simultáneamente.

### Callejón 2: Parchear el caché de Bun manualmente
Reemplazar archivos en el caché de Bun (`~/.bun/install/cache`) para forzar la versión correcta.  
**Por qué falló:** Bun re-valida o regenera el caché. Además el árbol de dependencias tiene múltiples versiones del mismo paquete en distintas profundidades y el parche sólo tocaba uno.

### Callejón 3: Downgrade todo a `@tanstack/start@1.120.19` y similares
Bajar todas las dependencias a la rama `1.120.x`.  
**Por qué falló:** El paquete `@tanstack/react-start-plugin@1.131.50` (que `@tanstack/start` descarga transitivamente) necesita `tsrSplit` de `@tanstack/router-plugin@1.131.50`, que no está en `1.120.x`. El árbol de dependencias transitivo nunca quedó coherente con `^semver`.

### Callejón 4: Configurar `app.config.ts` con `defineConfig` de `@tanstack/start/config`
La documentación vieja usaba este patrón. Con el paquete renombrado, el subpath `./config` ya no existe.  
**Error:** `Package subpath './config' is not defined by "exports"`

### Callejón 5: `@tanstack/react-router@1.168.6` junto a `@tanstack/react-start@1.168.6`
Fijar ambos a la misma versión numérica parece lógico, pero es incorrecto.  
**Por qué falló:** `react-start@1.168.6` declara internamente `@tanstack/react-router: 1.170.4` como su dependencia real. El `1.168.6` de `react-router` usa `router-core@1.168.5`, pero `start-server-core@1.168.4` (transitivo) necesita `router-core@1.171.2`. El resultado fue:

```
TypeError: Cannot read properties of undefined (reading 'get')
  at Object.dehydrate (ssr-server.js:208)
```

El `dehydrate` fallaba porque el router tenía la API de `router-core@1.168.5` pero el servidor esperaba la de `1.171.2` (`router.stores.matches.get()` no existía en la versión vieja).

---

## 3. Lo que ayudó parcialmente

- **Cambiar `apps/web` a npm** (Option B): separar `apps/web` del workspace de Bun eliminó los conflictos de caché global. El árbol de dependencias quedó aislado y manejable. Esto fue un paso necesario aunque no suficiente.
- **Identificar que el paquete correcto es `@tanstack/react-start`** (no `@tanstack/start`): permitió instalar la versión 1.168.6 del paquete nuevo, que tiene un sistema de configuración completamente diferente (usa `vite.config.ts` en lugar de `app.config.ts`).

---

## 4. Qué se resolvió y cómo (estado actual)

### Cambios en archivos que quedaron aplicados:

**`package.json` (raíz del monorepo)**
```json
"workspaces": ["apps/api", "packages/*"]
```
`apps/web` fue removida del workspace de Bun deliberadamente. No revertir esto.

**`apps/web/package.json`** — versiones que SÍ funcionan juntas:
```json
"@tanstack/react-router": "1.170.4",
"@tanstack/react-start": "1.168.6"
```
Instalado con `npm install --legacy-peer-deps` desde dentro de `apps/web/`.

**`apps/web/vite.config.ts`** (reemplaza al `app.config.ts` que no existe en 1.168.x):
```ts
import { defineConfig } from 'vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
export default defineConfig({
  plugins: [tanstackStart({ srcDirectory: 'app' })],
  server: { port: 3000 },
});
```
`srcDirectory: 'app'` es obligatorio porque el plugin busca en `src/` por defecto.

**`apps/web/app/router.tsx`** — archivo nuevo, obligatorio:
```ts
import { createRouter as createTanStackRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';

export function getRouter() {
  return createTanStackRouter({ routeTree, scrollRestoration: true });
}

declare module '@tanstack/react-router' {
  interface Register { router: ReturnType<typeof getRouter>; }
}
```
⚠️ El framework llama `routerEntry.getRouter()` — debe exportarse con ese nombre exacto, no `createRouter`.

**`apps/web/app/routes/__root.tsx`** — archivo nuevo (reemplaza `app/root.tsx` que fue eliminado):
- Importa `HeadContent` y `Scripts` de `@tanstack/react-router` (NO de `@tanstack/react-start`)
- `Meta` fue renombrado a `HeadContent` en v1.170.4+
- No usar el componente `<ScrollRestoration />` — está deprecated; usar `scrollRestoration: true` en `createRouter`

**`apps/web/app/routeTree.gen.ts`** — auto-generado por el plugin al arrancar el servidor. No editar.

### Estado de las 4 rutas:
| Ruta | HTTP | Notas |
|------|------|-------|
| `/` | 200 ✅ | HomeScreen — crea/join sala |
| `/lobby/$code` | 200 ✅ | LobbyScreen — polling room state |
| `/team/$code` | 200 ✅ | TeamSelectScreen — selección de equipo |
| `/battle/$code` | 200 ✅ | BattleScreen — SSE, sin cálculos en cliente |

Servidor levanta limpio: `npx vite dev --port 3000` desde `apps/web/`.

---

## 5. Hipótesis de causa raíz

El ecosistema `@tanstack/start` / `@tanstack/react-start` **no tiene versiones semánticas coherentes entre sus propios sub-paquetes**. Las versiones de `react-router`, `router-core`, `start-plugin-core`, `start-server-core` no están alineadas al mismo número. `react-start@1.168.6` internamente requiere `react-router@1.170.4` (dos minor versions adelante) y `router-core@1.171.2` (tres minor versions adelante).

Esto hace que instalar con `^semver` sin lock file actualizado sea una lotería. La solución correcta es:

1. No usar el workspace de Bun para `apps/web` (Bun hoistea versiones del caché global que corrompen el árbol)
2. Usar `npm install --legacy-peer-deps` para que npm instale exactamente lo que se pide
3. Verificar qué versión de `react-router` necesita la versión de `react-start` que se usa (buscar en el `package.json` de `node_modules/@tanstack/react-start/`)
4. No asumir que los números de versión de paquetes hermanos son intercambiables

---

## Pendiente para sesión siguiente

El frontend está levantado y renderizando. Lo que falta en Día 5:
- Probar flujo completo con la API corriendo (`docker compose up`)
- Verificar que SSE del battle screen funciona en el browser real
- Probar con dos tabs: crear sala → elegir equipos → pelear un turno
- Ajustes visuales si algo se ve mal en el browser

Día 6-7 (según plan original): animaciones, README, ensayo del demo.
