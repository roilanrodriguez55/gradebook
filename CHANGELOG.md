# Changelog

Formato basado en Keep a Changelog y versionado semantico (https://semver.org/lang/es/).

## [0.8.0] - 2026-10-29

### Added
- Grado y modalidad (CRD hasta 4to, CPE hasta 5to) en cada grupo, con el nombre generado
- Boton Retroceder para bajar estudiantes un grado

### Changed
- Promover sube un grado en la misma modalidad y crea el grupo destino si no existe, con curso destino a elegir
- El periodo del grupo pasa a ser semestre (1er o 2do, por defecto 1er); la migracion 006 convierte los grupos existentes
- La escala de nota y la carpeta de descargas de cada asignatura se editan ahora dentro de Editar grupo, en un solo modal
- El boton de cursos de Inicio ahora dice Administrar cursos

## [0.7.0] - 2026-10-29

### Changed
- La carpeta de descargas ahora se configura por grupo y asignatura, ya no se comparte entre todos los grupos de la asignatura
- Las carpetas existentes se copian a cada grupo al actualizar

## [0.6.0] - 2026-10-27

### Added
- Vista previa del reporte a pantalla completa en HTML (separada de la generacion del PDF) con zoom nitido (botones, Ctrl+rueda y ajustar al ancho), boton para salir y las opciones y Guardar PDF en la barra superior

### Changed
- Reporte de notas reestructurado con variantes segun el filtro (notas o estado) y secciones de pendientes y no entregaron
- Generar PDF abre directo la vista previa con el filtro de la tabla de entregas, sin dialogo ni selector de filtro
- El PDF solo se genera al pulsar Guardar PDF; el resumen del PDF va antes de la tabla con tarjetas de ancho fijo
- Textos del PDF y de la vista previa con acentos
- Opciones de la vista previa se deshabilitan cuando no aplican al filtro

## [0.5.0] - 2026-10-26

### Added
- Version de la app visible en el pie del sidebar, leida de package.json
- Boton para editar al estudiante (nombres, GitHub y arrastre) desde la lista de entregas de una evaluacion

### Changed
- Dialogos con scrollbar-gutter estable y espacio reservado para los errores del formulario de entrega

## [0.4.0] - 2026-10-26

### Added
- Cursos creables por el usuario y asignables a cada grupo, con el inicio agrupado por curso
- Promocion de estudiantes entre grupos y cursos con seleccion multiple, conservando el historial
- Arrastre: un estudiante puede cursar varias asignaturas de grupos anteriores
- Reporte PDF de cada evaluacion segun filtro (entregados, no entregaron, tardias, etc.)
- Crear estudiantes y pegar listas desde la pantalla de evaluacion
- En la tabla de estudiantes se selecciona haciendo clic en cualquier parte de la fila, y un boton alterna entre Seleccionar todos y Deseleccionar

### Changed
- Los estudiantes pasan a matricularse por grupo (migracion automatica 004)

## [0.3.0] - 2026-10-25

### Added
- Las entregas se editan en un formulario (repositorio, estado, nota y comentario) abierto desde el boton Editar de cada fila

### Changed
- La tabla de entregas es de solo lectura y cabe sin scroll lateral

### Fixed
- El menu de acciones de cada fila ya no queda recortado por la tabla

## [0.2.4] - 2026-10-25

### Fixed
- Las columnas de la tabla de entregas ya no se comprimen: los campos de repositorio y estado se ven completos y la tabla tiene scroll horizontal si no cabe

## [0.2.3] - 2026-10-25

### Fixed
- El reporte PDF muestra el tema y el titulo de la evaluacion

## [0.2.2] - 2026-10-24

### Fixed
- Tabla de entregas de la evaluacion ya no se congela (bucle de renders): los selects, el menu de acciones y los campos conservan el foco

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
