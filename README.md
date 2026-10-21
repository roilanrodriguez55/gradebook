# Gradebook

App de escritorio (Tauri 2 + React + TypeScript) para gestionar grupos, asignaturas, evaluaciones y entregas de estudiantes por GitHub. Descarga los repositorios con `git`, guarda notas y comentarios, y genera un PDF de notas por evaluacion.

Estructura de descargas. La carpeta se define por asignatura (boton de configuracion en el chip de la asignatura, dentro de la pantalla del grupo) y vale para todos sus grupos y evaluaciones:

```
<carpeta de la asignatura>/<Tema>/Notas_<Tema>.pdf
<carpeta de la asignatura>/<Tema>/<Nombres_Apellidos>/   <- el repo del estudiante
```

La escala de nota tambien es por asignatura (por defecto 2 a 5; el valor por defecto de las asignaturas nuevas se cambia en Ajustes).

## Requisitos

- Node.js 20 o superior y npm.
- Rust estable (`rustup`), con `cargo` en el PATH.
- `git` instalado (la app lo usa para clonar).
- Linux (Ubuntu/Debian), dependencias de Tauri:
  ```
  sudo apt install build-essential curl wget file libwebkit2gtk-4.1-dev libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
  ```
  En Windows y macOS ver https://v2.tauri.app/start/prerequisites/

## Desarrollo

```
npm install
npm run tauri dev
```

`tauri dev` levanta Vite en el puerto 1420 y compila el lado Rust la primera vez (tarda unos minutos). El frontend recarga solo al guardar; si cambias algo en `src-tauri/` se recompila y reinicia la ventana.

Comandos utiles:

| Comando | Para que |
|---|---|
| `npm run tauri dev` | Correr la app completa en desarrollo |
| `npm run dev` | Solo el frontend en el navegador (sin SQLite ni comandos de Tauri, la mayoria de pantallas no funcionan) |
| `npx tsc --noEmit` | Comprobar tipos |
| `npm run build` | Compilar el frontend a `dist/` |
| `cargo test --manifest-path src-tauri/Cargo.toml` | Tests de Rust (git, clone, respaldos) |
| `cargo check --manifest-path src-tauri/Cargo.toml` | Comprobar el lado Rust sin compilar todo |

Estructura del codigo:

- `src/db/`: acceso a SQLite (una funcion por operacion, se importan como `import * as students from "../db/students"`).
- `src/screens/` y `src/components/`: pantallas y UI.
- `src/lib/`: utilidades (normalizar enlaces, nombres de carpeta, descarga).
- `src/pdf/`: generacion del PDF con `@react-pdf/renderer`.
- `src-tauri/src/`: comandos Rust (`git.rs`, `clone.rs`, `restore.rs`).
- `src-tauri/migrations/`: esquema SQLite. Un cambio de esquema es un archivo nuevo (`004_...sql`, ya existen 001 a 003) registrado en `src-tauri/src/lib.rs`, nunca se editan los ya publicados.
- `src-tauri/capabilities/default.json`: permisos de Tauri (dialogos, fs, opener, sql). Si la app falla con "not allowed" o "forbidden path", casi siempre es aqui.

Datos locales: la base vive en `~/.config/com.roilanrodriguez55.gradebook/entregas.db` (Linux). Para empezar de cero en desarrollo, cierra la app y borra ese archivo (y sus `-wal` y `-shm`). Desde Ajustes se puede exportar un respaldo y restaurarlo.

## Versionado

Semver (`MAJOR.MINOR.PATCH`). La version esta en cinco archivos que deben coincidir: `package.json`, `package-lock.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` y `src-tauri/Cargo.lock`. No se editan a mano; se usa el script:

```
node scripts/bump-version.mjs <patch|minor|major> --added "..." --changed "..." --fixed "..."
```

Sube la version en los cinco archivos y agrega la entrada al `CHANGELOG.md`. Criterio: `patch` para fixes y ajustes, `minor` para features nuevas, `major` para cambios incompatibles (mientras sea 0.x, un cambio incompatible sube `minor`). Con Claude Code esto lo hace la skill `semver-bump` (`.claude/skills/semver-bump/`) al terminar cada feature o fix.

## Release

1. Validar:
   ```
   npx tsc --noEmit
   cargo test --manifest-path src-tauri/Cargo.toml
   npm run tauri dev     # probar a mano un ciclo: grupo, estudiantes, evaluacion, descarga, nota, PDF
   ```
2. Subir la version con el script de arriba (revisa que la entrada nueva del `CHANGELOG.md` sea correcta).
3. Compilar los instaladores:
   ```
   npm run tauri build
   ```
   Los artefactos quedan en `src-tauri/target/release/bundle/`:
   - Linux: `deb/*.deb`, `rpm/*.rpm`, `appimage/*.AppImage`
   - Solo el binario, sin instaladores: `npm run tauri build -- --no-bundle` (queda en `src-tauri/target/release/gradebook`)
   - Un solo formato: `npm run tauri build -- --bundles deb`
   Cada sistema operativo se compila en su propia maquina: en Linux salen `.deb`, `.rpm` y `.AppImage`; en Windows el mismo comando `npm run tauri build` genera `msi/*.msi` y `nsis/*.exe`. Desde Linux no se generan los instaladores de Windows de forma fiable (existe cross-compilacion con `cargo-xwin`, pero es experimental), asi que el build de Windows se hace en una maquina Windows o con el workflow de GitHub Actions.
4. Probar el instalador resultante en una maquina limpia o en otra cuenta (instalar, abrir, crear una evaluacion).
4b. Build automatico: el workflow `.github/workflows/build.yml` compila Linux y Windows en GitHub Actions en cada push a `main` (tambien se puede lanzar a mano desde la pestana Actions con "Run workflow"). Los instaladores quedan como artefactos del run (`gradebook-linux` y `gradebook-windows`, 14 dias). En Linux ademas corre `tsc` y `cargo test`.
5. Publicar: crear la etiqueta `vX.Y.Z` y subir los artefactos a una release de GitHub junto con las notas de esa version del `CHANGELOG.md`. (El proyecto aun no es un repositorio git; al inicializarlo, `git tag vX.Y.Z` y `git push --tags`.)

Pendientes conocidos del empaquetado:

- Los iconos de `src-tauri/icons/` salen de `design/icon-source.png` (emblema del logo sobre fondo oscuro, 1024x1024). Para cambiarlos: `npm run tauri icon design/icon-source.png` y borrar las carpetas `android` e `ios` que genera (la app es solo de escritorio). El logo original esta en `public/logo.png`; `public/logo-mark.png` es la version pequena que usa la barra lateral y el favicon.
- Los instaladores no estan firmados; Windows y macOS mostraran avisos de seguridad al instalar.
- Antes de un `major` o de una migracion SQL nueva, probar la restauracion de un respaldo de la version anterior.
