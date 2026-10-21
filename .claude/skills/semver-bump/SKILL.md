---
name: semver-bump
description: Sube la version de Gradebook en formato semver (MAJOR.MINOR.PATCH) y anota el CHANGELOG. Invocala SIEMPRE al terminar de implementar una feature, un cambio de comportamiento o un fix en este proyecto, despues de validar y antes de avisar que el trabajo esta listo. No la uses para cambios sin efecto en la app (solo docs, comentarios, tests o refactors internos sin cambio visible).
---

# Semver bump

La version vive en cinco archivos que deben coincidir siempre: `package.json`, `package-lock.json` (2 lugares), `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` y `src-tauri/Cargo.lock`. No los edites a mano: usa el script, que los actualiza juntos y falla si estan desincronizados.

## Cuando
Una vez por tarea, al final, con la implementacion ya validada (build y tests pasando). Si una misma tarea toca varias cosas, un solo bump con el nivel mas alto. Si no cambia nada visible para el usuario, no subas version.

## Que nivel
- `patch` (0.1.0 -> 0.1.1): fix de un bug, ajuste pequeno de una funcion existente (orden de campos, textos, validaciones, rendimiento).
- `minor` (0.1.1 -> 0.2.0): feature nueva o capacidad nueva visible para el usuario.
- `major` (0.x -> 1.0.0 o 1.x -> 2.0.0): cambio incompatible (cambia el esquema de la base sin migracion automatica, rompe respaldos anteriores, cambia la estructura de carpetas de descargas). Mientras la version sea 0.y.z, un cambio incompatible sube `minor`, y el salto a 1.0.0 solo lo decide el usuario: pregunta antes de hacerlo.

Una migracion SQL nueva (src-tauri/migrations) cuenta como minimo `minor`.

## Como
```
node scripts/bump-version.mjs <patch|minor|major> --added "..." --changed "..." --fixed "..."
```
Las banderas `--added`, `--changed` y `--fixed` se pueden repetir y son las lineas del CHANGELOG, en espanol, una frase corta por cambio, sin acentos como el resto del proyecto. Usa `--dry-run` para ver la version resultante sin escribir nada.

Despues del script, confirma con `git diff --stat` si el proyecto es repo git, o simplemente lee la primera entrada de `CHANGELOG.md`, y reporta al usuario la version anterior y la nueva en una linea.

## Reglas
- No hagas commit, tag ni push; eso lo pide el usuario.
- Si el script dice que las versiones estan desincronizadas, corrige primero la que difiere y reintenta.
- No cambies el identificador de la app (`com.roilanrodriguez55.gradebook`) ni el nombre del paquete en un bump.
