import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { ReportData, ReportOptions, ReportRow } from "./buildReportData";

const ACCENT = "#1F4E79";
const INK = "#111111";
const MUTED = "#555555";
const LINE = "#CCCCCC";

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10,
    color: INK,
    paddingTop: 40,
    paddingBottom: 56,
    paddingHorizontal: 40,
  },
  title: { fontSize: 20, fontFamily: "Helvetica-Bold", marginBottom: 6 },
  subtitle: { fontSize: 12, color: MUTED, marginBottom: 6 },
  meta: { fontSize: 10, color: MUTED, marginBottom: 2 },
  header: {
    borderBottomWidth: 1.5,
    borderBottomColor: ACCENT,
    paddingBottom: 10,
    marginBottom: 14,
  },
  table: { width: "100%" },
  row: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: LINE,
    paddingVertical: 5,
  },
  headerRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: ACCENT,
    paddingVertical: 5,
    backgroundColor: "#FFFFFF",
  },
  headerText: { fontFamily: "Helvetica-Bold", color: ACCENT },
  colN: { width: 28 },
  colName: { flexGrow: 1, flexBasis: 0, paddingRight: 8 },
  colGrade: { width: 70, textAlign: "right", paddingRight: 8 },
  colComment: { width: 170 },
  tag: { fontSize: 8, color: ACCENT, fontFamily: "Helvetica-Bold", marginLeft: 4 },
  summary: {
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: ACCENT,
    paddingTop: 8,
  },
  summaryRow: { flexDirection: "row", flexWrap: "wrap", gap: 18 },
  summaryItem: { fontSize: 10 },
  summaryLabel: { color: MUTED },
  sectionTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
    color: ACCENT,
    marginTop: 18,
    marginBottom: 6,
  },
  notRow: {
    borderBottomWidth: 0.5,
    borderBottomColor: LINE,
    paddingVertical: 3,
  },
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

export function EvaluationReport({ data, options, generatedAt }: Props) {
  const grupo = data.periodo ? `${data.grupo} (${data.periodo})` : data.grupo;
  const fechaLimite = formatDate(data.fechaLimite);
  const stats = data.estadisticas;
  const showNotDelivered = options.includeNotDelivered && data.noEntregaron.length > 0;

  return (
    <Document title={`Notas - ${data.titulo}`} author={data.profesor ?? undefined}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>{data.titulo}</Text>
          {data.descripcion && data.descripcion !== data.titulo ? (
            <Text style={styles.subtitle}>{data.descripcion}</Text>
          ) : null}
          <Text style={styles.meta}>
            {`${data.asignatura} - ${grupo} - Generado el ${generatedAt}`}
          </Text>
          {data.profesor ? <Text style={styles.meta}>{`Profesor: ${data.profesor}`}</Text> : null}
          {fechaLimite ? <Text style={styles.meta}>{`Fecha limite: ${fechaLimite}`}</Text> : null}
        </View>

        <View style={styles.table}>
          <View style={styles.headerRow} fixed>
            <Text style={[styles.headerText, styles.colN]}>#</Text>
            <Text style={[styles.headerText, styles.colName]}>Nombres y apellidos</Text>
            <Text style={[styles.headerText, styles.colGrade]}>Nota</Text>
            {options.includeComments ? (
              <Text style={[styles.headerText, styles.colComment]}>Comentario</Text>
            ) : null}
          </View>

          {data.filas.map((row) => (
            <View key={row.n} style={styles.row} wrap={false}>
              <Text style={styles.colN}>{String(row.n)}</Text>
              <Text style={styles.colName}>
                {row.nombre}
                {row.tardia ? <Text style={styles.tag}>  Tardia</Text> : null}
              </Text>
              <Text style={styles.colGrade}>{formatNota(row)}</Text>
              {options.includeComments ? (
                <Text style={styles.colComment}>{row.comentario}</Text>
              ) : null}
            </View>
          ))}
        </View>

        <View style={styles.summary} wrap={false}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Promedio: </Text>
              {formatStat(stats.promedio)}
            </Text>
            <Text style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Maxima: </Text>
              {formatStat(stats.maxima)}
            </Text>
            <Text style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Minima: </Text>
              {formatStat(stats.minima)}
            </Text>
            <Text style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Entregaron: </Text>
              {`${stats.entregaron} de ${stats.total}`}
            </Text>
          </View>
        </View>

        {showNotDelivered ? (
          <View>
            <Text style={styles.sectionTitle}>{`No entregaron (${data.noEntregaron.length})`}</Text>
            {data.noEntregaron.map((nombre) => (
              <Text key={nombre} style={styles.notRow} wrap={false}>
                {nombre}
              </Text>
            ))}
          </View>
        ) : null}

        <View style={styles.footer} fixed>
          <Text>{data.titulo}</Text>
          <Text
            render={({ pageNumber, totalPages }) => `Pagina ${pageNumber} de ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}
