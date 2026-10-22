# Gradehub

App de escritorio (Tauri 2 + React + TypeScript) para que el profesor gestione grupos, asignaturas, evaluaciones y entregas de estudiantes por GitHub. Clona los repositorios con `git`, guarda notas y comentarios, y genera un PDF de notas por evaluacion.

## Que hace

- Grupos, estudiantes (se pueden pegar en bloque) y asignaturas con su propia escala de nota.
- Evaluaciones con fecha de entrega y tabla de entregas por estudiante.
- Descarga de los repositorios de las entregas y restauracion de respaldos.
- Exportacion de un PDF de notas por evaluacion.
- Datos locales en SQLite, con respaldo y restauracion desde Ajustes.

## Carpeta de descargas

La carpeta se define por asignatura (boton de configuracion en el chip de la asignatura, dentro de la pantalla del grupo) y vale para todos sus grupos y evaluaciones:

```
<carpeta de la asignatura>/<Tema>/Notas_<Tema>.pdf
<carpeta de la asignatura>/<Tema>/<Nombres_Apellidos>/   <- repo del estudiante
```

La escala de nota tambien es por asignatura (por defecto 2 a 5). El valor por defecto de las asignaturas nuevas se cambia en Ajustes.

## Requisitos

- Node.js 20 o superior y npm.
- Rust estable (`rustup`) con `cargo` en el PATH.
- `git` instalado (la app lo usa para clonar).
- Dependencias de Tauri en Linux (Ubuntu/Debian):
  ```
  sudo apt install build-essential curl wget file libwebkit2gtk-4.1-dev libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
  ```
  Para Windows y macOS ver https://v2.tauri.app/start/prerequisites/

## Desarrollo

```
npm install
npm run tauri dev
```

`tauri dev` levanta Vite en el puerto 1420 y compila el lado Rust (la primera vez tarda unos minutos). El frontend recarga al guardar. Si cambias algo en `src-tauri/`, se recompila y reinicia la ventana.

| Comando | Para que |
|---|---|
| `npm run tauri dev` | App completa en desarrollo |
| `npm run dev` | Solo el frontend en el navegador (sin SQLite ni comandos de Tauri, la mayoria de pantallas no funcionan) |
| `npx tsc --noEmit` | Comprobar tipos |
| `npm run build` | Compilar el frontend a `dist/` |
| `cargo test --manifest-path src-tauri/Cargo.toml` | Tests de Rust (git, clone, respaldos) |
| `cargo check --manifest-path src-tauri/Cargo.toml` | Comprobar el lado Rust sin compilar todo |

### Estructura del codigo

| Ruta | Contenido |
|---|---|
| `src/db/` | Acceso a SQLite, una funcion por operacion (`import * as students from "../db/students"`) |
| `src/screens/`, `src/components/` | Pantallas y UI |
| `src/lib/` | Utilidades: enlaces, nombres de carpeta, descarga |
| `src/pdf/` | PDF con `@react-pdf/renderer` |
| `src-tauri/src/` | Comandos Rust (`git.rs`, `clone.rs`, `restore.rs`) |
| `src-tauri/migrations/` | Esquema SQLite |
| `src-tauri/capabilities/default.json` | Permisos de Tauri (dialogos, fs, opener, sql) |

Notas:

- Un cambio de esquema es un archivo nuevo (`004_...sql`, ya existen 001 a 003) registrado en `src-tauri/src/lib.rs`. Los ya publicados no se editan.
- Si la app falla con "not allowed" o "forbidden path", casi siempre falta un permiso en `capabilities/default.json`.

### Datos locales

La base esta en `~/.local/share/com.roilanrodriguez55.gradehub/entregas.db` (Linux) o `%APPDATA%\com.roilanrodriguez55.gradehub\entregas.db` (Windows). En Ajustes, seccion Datos, el boton "Abrir carpeta" la abre. Al primer arranque, si existe una base en la carpeta de configuracion anterior (`~/.config/...`), se copia a la nueva. Para empezar de cero en desarrollo, cierra la app y borra ese archivo junto con sus `-wal` y `-shm`.

## Versionado

Semver (`MAJOR.MINOR.PATCH`). La version vive en cinco archivos que deben coincidir: `package.json`, `package-lock.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` y `src-tauri/Cargo.lock`. No se editan a mano, se usa el script:

```
node scripts/bump-version.mjs <patch|minor|major> --added "..." --changed "..." --fixed "..."
```

Sube la version en los cinco archivos y agrega la entrada al `CHANGELOG.md`.

- `patch`: fixes y ajustes.
- `minor`: features nuevas.
- `major`: cambios incompatibles (mientras sea 0.x, un cambio incompatible sube `minor`).

Con Claude Code lo hace la skill `semver-bump` (`.claude/skills/semver-bump/`) al terminar cada feature o fix.

## Release

1. Validar:
   ```
   npx tsc --noEmit
   cargo test --manifest-path src-tauri/Cargo.toml
   npm run tauri dev
   ```
   En `tauri dev`, probar a mano un ciclo completo: grupo, estudiantes, evaluacion, descarga, nota, PDF.
2. Subir la version con el script de arriba y revisar la entrada nueva del `CHANGELOG.md`.
3. Compilar los instaladores:
   ```
   npm run tauri build
   ```
   Los artefactos quedan en `src-tauri/target/release/bundle/`. En Linux salen `deb/*.deb`, `rpm/*.rpm` y `appimage/*.AppImage`. Variantes:
   - Solo el binario: `npm run tauri build -- --no-bundle` (queda en `src-tauri/target/release/gradehub`).
   - Un solo formato: `npm run tauri build -- --bundles deb`.

   Cada sistema se compila en su propia maquina. En Windows el mismo comando genera `msi/*.msi` y `nsis/*.exe`. Desde Linux no se generan de forma fiable (`cargo-xwin` existe pero es experimental), asi que el build de Windows se hace en una maquina Windows o con GitHub Actions.
4. Probar el instalador en una maquina limpia o en otra cuenta: instalar, abrir, crear una evaluacion.
5. Publicar: crear la etiqueta `vX.Y.Z` y subir los artefactos a una release de GitHub junto con las notas de esa version del `CHANGELOG.md`.

### Build automatico

El workflow `.github/workflows/build.yml` compila Linux y Windows en GitHub Actions en cada push a `main`. Tambien se lanza a mano desde la pestana Actions con "Run workflow". Los instaladores quedan como artefactos del run (`gradehub-linux` y `gradehub-windows`, 14 dias). En Linux ademas corre `tsc` y `cargo test`.

### Pendientes del empaquetado

- Los iconos de `src-tauri/icons/` salen de `design/icon-source.png` (emblema del logo sobre fondo oscuro, 1024x1024). Para cambiarlos: `npm run tauri icon design/icon-source.png` y borrar las carpetas `android` e `ios` que genera (la app es solo de escritorio). El logo original esta en `public/logo.png`; `public/logo-mark.png` es la version pequena de la barra lateral y el favicon.
- Los instaladores no estan firmados, Windows y macOS mostraran avisos de seguridad al instalar.
- Antes de un `major` o de una migracion SQL nueva, probar la restauracion de un respaldo de la version anterior.
