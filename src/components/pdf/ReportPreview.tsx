import clsx from "clsx";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type {
  ReportData,
  ReportOptions,
  ReportRow,
  ReportStatus,
} from "../../pdf/buildReportData";
import { Button } from "../ui/Button";

// Ancho base de una hoja A4 en px, igual que la escala de referencia del PDF.
const ANCHO_HOJA = 794;
const MARGEN_PX = 16;
const ESCALA_MIN = 0.5;
const ESCALA_MAX = 4;
const PASO = 0.1;

const ESTADO_LABEL: Record<ReportStatus, string> = {
  entregado: "Entregado",
  tardia: "Tardía",
  pendiente: "Pendiente",
  no_entrego: "No entregó",
};

function limitar(valor: number): number {
  return Math.min(ESCALA_MAX, Math.max(ESCALA_MIN, valor));
}

// Redondea al 10% mas cercano despues de sumar el paso, para que los botones y atajos den valores redondos.
function pasoZoom(actual: number, delta: number): number {
  return limitar(Math.round((actual + delta) * 10) / 10);
}

// Muestra notas con hasta dos decimales y sin ceros sobrantes.
function formatNumber(n: number): string {
  return String(Math.round(n * 100) / 100);
}

function formatNota(row: ReportRow): string {
  return row.nota === null
    ? "-"
    : `${formatNumber(row.nota)} / ${formatNumber(row.notaMax)}`;
}

// Convierte la fecha guardada (YYYY-MM-DD) a dd/mm/yyyy. Cualquier otro texto se muestra tal cual.
function formatDate(value: string | null): string | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

function formatStat(n: number | null): string {
  return n === null ? "-" : formatNumber(n);
}

interface Card {
  label: string;
  value: string;
}

// Tarjeta de resumen: valor grande en negrita y etiqueta pequena debajo.
function SummaryCards({ cards }: { cards: Card[] }) {
  return (
    <div className="mt-3.5 flex gap-2">
      {cards.map((card) => (
        <div
          key={card.label}
          className="min-w-0 flex-1 rounded border border-[#CCC] px-2.5 py-2"
        >
          <div className="text-lg font-bold text-[#1F4E79]">{card.value}</div>
          <div className="text-[11px] text-[#555]">{card.label}</div>
        </div>
      ))}
    </div>
  );
}

// Lista numerada de nombres bajo un titulo con filete.
function NameList({ titulo, nombres }: { titulo: string; nombres: string[] }) {
  return (
    <section className="mt-4">
      <h2 className="border-b border-[#CCC] pb-1 text-sm font-bold text-[#1F4E79]">
        {titulo}
      </h2>
      <ol className="mt-1.5 list-decimal pl-6 text-[13px]">
        {nombres.map((nombre, i) => (
          <li key={`${i}-${nombre}`} className="py-0.5">
            {nombre}
          </li>
        ))}
      </ol>
    </section>
  );
}

interface Props {
  data: ReportData;
  options: ReportOptions;
  generatedAt: string;
}

export default function ReportPreview({ data, options, generatedAt }: Props) {
  const [zoom, setZoom] = useState(1);
  const [alturaHoja, setAlturaHoja] = useState(0);
  const contenedorRef = useRef<HTMLDivElement>(null);
  const hojaRef = useRef<HTMLElement>(null);
  const zoomRef = useRef(1);
  const deltaRef = useRef(0);
  const rafRef = useRef(0);
  const anclaRef = useRef<{
    x: number;
    y: number;
    px: number;
    py: number;
  } | null>(null);

  zoomRef.current = zoom;

  // Mide la altura de la hoja sin escalar (el transform no afecta el layout).
  useEffect(() => {
    const el = hojaRef.current;
    if (!el) return;
    const observador = new ResizeObserver(() => setAlturaHoja(el.offsetHeight));
    observador.observe(el);
    setAlturaHoja(el.offsetHeight);
    return () => observador.disconnect();
  }, []);

  // Tras aplicar el zoom, reajusta el scroll para que el punto bajo el cursor no se mueva.
  useLayoutEffect(() => {
    const ancla = anclaRef.current;
    const cont = contenedorRef.current;
    const hoja = hojaRef.current;
    anclaRef.current = null;
    if (!ancla || !cont || !hoja) return;
    const rect = hoja.getBoundingClientRect();
    cont.scrollLeft += rect.left + ancla.px * zoom - ancla.x;
    cont.scrollTop += rect.top + ancla.py * zoom - ancla.y;
  }, [zoom]);

  // Ctrl + rueda acumula deltas y aplica un solo cambio por frame. El listener no es pasivo para cancelar el zoom del navegador.
  useEffect(() => {
    const el = contenedorRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      deltaRef.current += e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      const hoja = hojaRef.current;
      if (hoja) {
        const rect = hoja.getBoundingClientRect();
        const z = zoomRef.current;
        anclaRef.current = {
          x: e.clientX,
          y: e.clientY,
          px: (e.clientX - rect.left) / z,
          py: (e.clientY - rect.top) / z,
        };
      }
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0;
        const delta = deltaRef.current;
        deltaRef.current = 0;
        setZoom((z) => limitar(z * Math.exp(-delta * 0.0015)));
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    };
  }, []);

  // Atajos solo mientras la vista esta montada.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        setZoom((z) => pasoZoom(z, PASO));
      } else if (e.key === "-") {
        e.preventDefault();
        setZoom((z) => pasoZoom(z, -PASO));
      } else if (e.key === "0") {
        e.preventDefault();
        setZoom(1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Accion puntual: calcula la escala una vez y la deja como numero.
  const ajustarAlAncho = () => {
    const cont = contenedorRef.current;
    if (!cont) return;
    setZoom(limitar((cont.clientWidth - MARGEN_PX * 2) / ANCHO_HOJA));
  };

  const grupo = data.periodo ? `${data.grupo} (${data.periodo})` : data.grupo;
  const fechaLimite = formatDate(data.fechaLimite);
  const stats = data.estadisticas;
  const esNotas = data.variante === "notas";
  const showComments = esNotas && options.includeComments;
  const hasRows = data.filas.length > 0;
  const hasPendientes = data.pendientes.length > 0;
  const hasNoEntregaron = data.noEntregaron.length > 0;
  const nothingToShow = !hasRows && !hasPendientes && !hasNoEntregaron;

  const meta: { etiqueta: string; valor: string }[] = [
    { etiqueta: "Asignatura", valor: data.asignatura },
    { etiqueta: "Grupo", valor: grupo },
    ...(data.profesor ? [{ etiqueta: "Profesor", valor: data.profesor }] : []),
    ...(fechaLimite ? [{ etiqueta: "Fecha límite", valor: fechaLimite }] : []),
    { etiqueta: "Generado el", valor: generatedAt },
    ...(data.filtroEtiqueta
      ? [{ etiqueta: "Filtro", valor: data.filtroEtiqueta }]
      : []),
  ];

  const cards: Card[] = esNotas
    ? [
        { label: "Promedio", value: formatStat(stats.promedio) },
        { label: "Máxima", value: formatStat(stats.maxima) },
        { label: "Mínima", value: formatStat(stats.minima) },
        { label: "Entregaron", value: `${stats.entregaron} de ${stats.total}` },
      ]
    : [{ label: data.filtroEtiqueta ?? "Total", value: String(stats.total) }];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-10 shrink-0 items-center justify-center gap-2 border-b border-line bg-surface px-3">
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Reducir zoom"
          disabled={zoom <= ESCALA_MIN}
          onClick={() => setZoom(pasoZoom(zoom, -PASO))}
        >
          −
        </Button>
        <span className="w-12 text-center text-sm tabular-nums text-ink">
          {Math.round(zoom * 100)}%
        </span>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Aumentar zoom"
          disabled={zoom >= ESCALA_MAX}
          onClick={() => setZoom(pasoZoom(zoom, PASO))}
        >
          +
        </Button>
        <span className="mx-1 h-4 w-px bg-line" />
        <Button size="sm" variant="secondary" onClick={() => setZoom(1)}>
          100%
        </Button>
        <Button size="sm" variant="secondary" onClick={ajustarAlAncho}>
          Ajustar al ancho
        </Button>
      </div>

      <div
        ref={contenedorRef}
        className="min-h-0 flex-1 overflow-auto bg-hover"
      >
        <div className="p-4" style={{ minWidth: "max-content" }}>
          <div
            className="relative mx-auto shrink-0"
            style={{ width: ANCHO_HOJA * zoom, height: alturaHoja * zoom }}
          >
            <article
              ref={hojaRef}
              className="absolute left-0 top-0 bg-white p-12 text-[#111] shadow-lg"
              style={{
                width: ANCHO_HOJA,
                boxSizing: "border-box",
                transform: `scale(${zoom})`,
                transformOrigin: "top left",
              }}
            >
              <header className="mb-3.5 border-b-[1.5px] border-[#1F4E79] pb-2.5">
                <h1 className="text-[20px] font-bold leading-tight">
                  {data.titulo}
                </h1>
                {data.descripcion && data.descripcion !== data.titulo ? (
                  <p className="mb-2 mt-1 text-[12px] text-[#555]">
                    {data.descripcion}
                  </p>
                ) : null}
                <div className="grid grid-cols-2 gap-x-2">
                  {meta.map((item) => (
                    <div key={item.etiqueta} className="mt-0.5 text-[11px]">
                      <span className="text-[#555]">{`${item.etiqueta}: `}</span>
                      <span>{item.valor}</span>
                    </div>
                  ))}
                </div>
              </header>

              {hasRows ? (
                <table className="w-full table-fixed border-collapse text-[13px]">
                  <thead>
                    <tr className="bg-[#EEF3F8] text-left text-xs font-bold text-[#1F4E79]">
                      <th className="w-7 px-1.5 py-1.5">#</th>
                      <th className="px-1.5 py-1.5">Nombres y apellidos</th>
                      {esNotas ? (
                        <th className="w-28 px-1.5 py-1.5 text-right">Nota</th>
                      ) : (
                        <th className="w-28 px-1.5 py-1.5">Estado</th>
                      )}
                      {showComments ? (
                        <th className="w-[170px] px-1.5 py-1.5">Comentario</th>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody>
                    {data.filas.map((row, index) => {
                      const isLast = index === data.filas.length - 1;
                      return (
                        <tr
                          key={row.n}
                          className={clsx(
                            index % 2 === 1 && "bg-[#F7F9FB]",
                            isLast && "border-b border-[#CCC]",
                          )}
                        >
                          <td className="px-1.5 py-1.5 align-top">{row.n}</td>
                          <td className="break-words px-1.5 py-1.5 align-top">
                            {row.nombre}
                            {row.arrastre ? " (arrastre)" : ""}
                            {esNotas && row.tardia ? (
                              <span className="ml-1 text-[11px] font-bold text-[#1F4E79]">
                                Tardía
                              </span>
                            ) : null}
                          </td>
                          {esNotas ? (
                            <td className="px-1.5 py-1.5 text-right align-top tabular-nums">
                              {formatNota(row)}
                            </td>
                          ) : (
                            <td className="px-1.5 py-1.5 align-top">
                              {ESTADO_LABEL[row.estado]}
                            </td>
                          )}
                          {showComments ? (
                            <td className="break-words px-1.5 py-1.5 align-top">
                              {row.comentario}
                            </td>
                          ) : null}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : null}

              <SummaryCards cards={cards} />

              {nothingToShow ? (
                <p className="mt-6 text-center text-[13px] text-[#555]">
                  Sin estudiantes para este filtro
                </p>
              ) : null}

              {hasPendientes ? (
                <NameList
                  titulo={`Pendientes (${data.pendientes.length})`}
                  nombres={data.pendientes}
                />
              ) : null}

              {hasNoEntregaron ? (
                <NameList
                  titulo={`No entregaron (${data.noEntregaron.length})`}
                  nombres={data.noEntregaron}
                />
              ) : null}
            </article>
          </div>
        </div>
      </div>
    </div>
  );
}
