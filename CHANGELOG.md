# Changelog

Formato basado en Keep a Changelog y versionado semantico (https://semver.org/lang/es/).

## [0.2.1] - 2026-10-21

### Added
- Logo de la app: icono de escritorio, favicon y barra lateral

## [0.2.0] - 2026-10-21

### Added
- Escala de nota por asignatura (por defecto 2 a 5), configurable desde el chip de la asignatura y valor por defecto en Ajustes
- Carpeta de descargas por asignatura, compartida por todos sus grupos y evaluaciones
- Dialogo de configuracion de la asignatura (escala y carpeta)

### Changed
- Las evaluaciones ya no tienen nota maxima propia; usan la escala de su asignatura
- Se quita la carpeta de descargas por defecto de Ajustes
- Migraciones 002 (escala) y 003 (carpeta de descargas) en subjects

## [0.1.1] - 2026-10-21

### Added
- README con el flujo de desarrollo y de release; skill semver-bump y script de versionado

### Changed
- El nombre se muestra y se guarda en carpetas como Nombres Apellidos; el pegado de lista usa 'Nombres, Apellidos'
- La ventana arranca maximizada
- Selector de fecha propio, tematizado y en espanol, en lugar del calendario nativo
- Sin seleccion de texto ni menu contextual del webview (se mantienen en campos de texto); cursor pointer en botones

### Fixed
- Botones de accion de la lista de estudiantes y otros iconos se veian apretados

## [0.1.0] - 2026-10-21

### Added
- Gestion de grupos, asignaturas y estudiantes (alta manual y pegado de lista).
- Evaluaciones con tabla de entregas: enlace de repositorio, estado, nota y comentario.
- Descarga de repositorios con git (clone o pull) en `<carpeta>/<Tema>/<Apellidos_Nombres>`.
- Marca de entrega tardia segun la fecha del ultimo commit.
- PDF de notas por evaluacion con vista previa.
- Ajustes: carpeta por defecto, deteccion de git, nombre del profesor, respaldo y restauracion de la base.
