import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { ReportData, ReportOptions, ReportRow, ReportStatus } from "./buildReportData";

const ACCENT = "#1F4E79";
const INK = "#111111";
const MUTED = "#555555";
const LINE = "#CCCCCC";
const HEAD_BG = "#EEF3F8";
const ZEBRA = "#F7F9FB";

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10,
    color: INK,
    paddingTop: 40,
    paddingBottom: 64,
    paddingHorizontal: 40,
  },
  header: {
    borderBottomWidth: 1.5,
    borderBottomColor: ACCENT,
    paddingBottom: 10,
    marginBottom: 14,
  },
  title: { fontSize: 20, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  subtitle: { fontSize: 12, color: MUTED, marginBottom: 8 },
  metaGrid: { flexDirection: "row", flexWrap: "wrap" },
  metaItem: { width: "50%", fontSize: 9, marginTop: 3, paddingRight: 8 },
  metaLabel: { color: MUTED },
  metaValue: { color: INK },
  table: { marginTop: 8 },
  tableHead: {
    flexDirection: "row",
    backgroundColor: HEAD_BG,
    paddingVertical: 5,
    paddingHorizontal: 6,
  },
  headerText: { fontFamily: "Helvetica-Bold", fontSize: 9, color: ACCENT },
  row: {
    flexDirection: "row",
    paddingVertical: 5,
    paddingHorizontal: 6,
  },
  zebra: { backgroundColor: ZEBRA },
  rowLast: { borderBottomWidth: 0.5, borderBottomColor: LINE },
  colN: { width: 28 },
  colName: { flexGrow: 1, flexBasis: 0, paddingRight: 8 },
  colGrade: { width: 80, textAlign: "right", paddingRight: 8 },
  colEstado: { width: 110, paddingRight: 8 },
  colComment: { width: 170 },
  tag: { fontSize: 8, color: ACCENT, fontFamily: "Helvetica-Bold" },
  cards: { flexDirection: "row", marginBottom: 6 },
  // Cada celda ocupa un cuarto del ancho; el espacio entre tarjetas sale del padding de la celda.
  cardCell: { width: "25%", paddingLeft: 4, paddingRight: 4 },
  cardCellFirst: { paddingLeft: 0 },
  cardCellLast: { paddingRight: 0 },
  card: {
    borderWidth: 0.5,
    borderColor: LINE,
    borderRadius: 4,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  cardValue: { fontFamily: "Helvetica-Bold", fontSize: 16, color: ACCENT, marginBottom: 2 },
  cardLabel: { fontSize: 8, color: MUTED },
  sectionTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
    color: ACCENT,
    borderBottomWidth: 0.5,
    borderBottomColor: LINE,
    paddingBottom: 4,
    marginTop: 18,
    marginBottom: 6,
  },
  listItem: { fontSize: 10, paddingVertical: 3, paddingLeft: 6 },
  empty: { marginTop: 24, fontSize: 10, color: MUTED, textAlign: "center" },
  footer: {
    position: "absolute",
    bottom: 22,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8,
    color: MUTED,
  },
});

interface Props {
  data: ReportData;
  options: ReportOptions;
  generatedAt: string;
}

const ESTADO_LABEL: Record<ReportStatus, string> = {
  entregado: "Entregado",
  tardia: "Tardía",
  pendiente: "Pendiente",
  no_entrego: "No entregó",
};

// Muestra notas con hasta dos decimales y sin ceros sobrantes.
function formatNumber(n: number): string {
  return String(Math.round(n * 100) / 100);
}

function formatNota(row: ReportRow): string {
  return row.nota === null ? "-" : `${formatNumber(row.nota)} / ${formatNumber(row.notaMax)}`;
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
    <View style={styles.cards} wrap={false}>
      {cards.map((card, i) => (
        <View
          key={card.label}
          style={[
            styles.cardCell,
            i === 0 ? styles.cardCellFirst : {},
            i === cards.length - 1 && cards.length > 1 ? styles.cardCellLast : {},
          ]}
        >
          <View style={styles.card}>
            <Text style={styles.cardValue}>{card.value}</Text>
            <Text style={styles.cardLabel}>{card.label}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

// Lista numerada de nombres. El titulo se mantiene junto a la primera fila para no quedar huerfano.
function NameList({ titulo, nombres }: { titulo: string; nombres: string[] }) {
  const [primero, ...resto] = nombres;
  return (
    <View>
      <View wrap={false}>
        <Text style={styles.sectionTitle}>{titulo}</Text>
        <Text style={styles.listItem}>{`1. ${primero}`}</Text>
      </View>
      {resto.map((nombre, i) => (
        <Text key={`${i}-${nombre}`} style={styles.listItem} wrap={false}>
          {`${i + 2}. ${nombre}`}
        </Text>
      ))}
    </View>
  );
}

export function EvaluationReport({ data, options, generatedAt }: Props) {
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
    ...(data.filtroEtiqueta ? [{ etiqueta: "Filtro", valor: data.filtroEtiqueta }] : []),
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
    <Document title={`Notas - ${data.titulo}`} author={data.profesor ?? undefined}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>{data.titulo}</Text>
          {data.descripcion && data.descripcion !== data.titulo ? (
            <Text style={styles.subtitle}>{data.descripcion}</Text>
          ) : null}
          <View style={styles.metaGrid}>
            {meta.map((item) => (
              <Text key={item.etiqueta} style={styles.metaItem}>
                <Text style={styles.metaLabel}>{`${item.etiqueta}: `}</Text>
                <Text style={styles.metaValue}>{item.valor}</Text>
              </Text>
            ))}
          </View>
        </View>

        <SummaryCards cards={cards} />

        {hasRows ? (
          <View style={styles.table}>
            <View style={styles.tableHead} fixed>
              <Text style={[styles.headerText, styles.colN]}>#</Text>
              <Text style={[styles.headerText, styles.colName]}>Nombres y apellidos</Text>
              {esNotas ? (
                <Text style={[styles.headerText, styles.colGrade]}>Nota</Text>
              ) : (
                <Text style={[styles.headerText, styles.colEstado]}>Estado</Text>
              )}
              {showComments ? <Text style={[styles.headerText, styles.colComment]}>Comentario</Text> : null}
            </View>

            {data.filas.map((row, index) => {
              const isLast = index === data.filas.length - 1;
              const rowStyle = [
                styles.row,
                index % 2 === 1 ? styles.zebra : {},
                isLast ? styles.rowLast : {},
              ];
              return (
                <View key={row.n} style={rowStyle} wrap={false}>
                  <Text style={styles.colN}>{String(row.n)}</Text>
                  <Text style={styles.colName}>
                    {row.nombre}
                    {row.arrastre ? " (arrastre)" : ""}
                    {esNotas && row.tardia ? <Text style={styles.tag}>{" Tardía"}</Text> : null}
                  </Text>
                  {esNotas ? (
                    <Text style={styles.colGrade}>{formatNota(row)}</Text>
                  ) : (
                    <Text style={styles.colEstado}>{ESTADO_LABEL[row.estado]}</Text>
                  )}
                  {showComments ? <Text style={styles.colComment}>{row.comentario}</Text> : null}
                </View>
              );
            })}
          </View>
        ) : null}

        {nothingToShow ? <Text style={styles.empty}>Sin estudiantes para este filtro</Text> : null}

        {hasPendientes ? <NameList titulo={`Pendientes (${data.pendientes.length})`} nombres={data.pendientes} /> : null}

        {hasNoEntregaron ? (
          <NameList titulo={`No entregaron (${data.noEntregaron.length})`} nombres={data.noEntregaron} />
        ) : null}

        <View style={styles.footer} fixed>
          <Text>{data.titulo}</Text>
          <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
