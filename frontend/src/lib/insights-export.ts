import * as XLSX from 'xlsx'
import { saveAs } from 'file-saver'
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType,
} from 'docx'

const CO2_FACTOR = 0.585

export interface ExportData {
  days: number
  storeName: string
  energy: {
    electricity: { kwh: number; cost_myr: number; co2e_kg: number; delta_pct: number }
    water: { m3: number; cost_myr: number; delta_pct: number }
  }
  footfall: {
    footfall: { total: number; avg_daily: number; delta_pct: number }
    sales: { revenue_myr: number; transactions: number; delta_pct: number }
    conversion: { rate_pct: number; delta_pp: number }
  }
  waste: { total_cost_myr: number; total_co2e_kg: number; events_count: number; categories: Record<string, { count: number; cost_myr: number }> }
  inventory: { total_items: number; low_stock: number; at_risk: number; spoilage_cost_myr: number }
  anomalies: Array<{ metric: string; zone: string | null; severity: string; z_score: number; value: number; description: string; ts: string }>
  elecTrend: Array<{ date: string; value: number; cost_myr: number; co2e_kg: number }>
  waterTrend: Array<{ date: string; value: number; cost_myr: number }>
  footTrend: Array<{ date: string; footfall: number; revenue_myr: number; transactions: number; conversion_pct: number }>
  zones: Array<{ zone: string; value: number; cost_myr: number; pct: number }>
  spoilage: Array<{ name: string; sku: string; spoilage_cost_myr: number; spoiled_qty: number }>
  peaks: Array<{ dow: number; hour: number; avg_count: number; label: string }>
}

function fmtRM(n: number) {
  return `RM ${n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function downloadXlsx(r: ExportData) {
  const wb = XLSX.utils.book_new()
  const now = new Date().toLocaleString()
  const co2e = r.energy.electricity.co2e_kg
  const totalUtilities = r.energy.electricity.cost_myr + r.energy.water.cost_myr
  const grossMargin = r.footfall.sales.revenue_myr - totalUtilities - r.waste.total_cost_myr
  const txnAvg = r.footfall.sales.transactions
    ? r.footfall.sales.revenue_myr / r.footfall.sales.transactions : 0
  const highCount = r.anomalies.filter(a => a.severity === 'HIGH').length

  const summary: (string | number)[][] = [
    ['ResWatch — Insights Report'],
    ['Store', r.storeName],
    ['Period', `Last ${r.days} days`],
    ['Generated', now],
    [],
    ['HEADLINE KPIs'],
    ['Metric', 'Value', 'Unit', 'Delta vs prior period'],
    ['Total CO₂ Emissions', Math.round(co2e), 'kg CO₂e', `${r.energy.electricity.delta_pct.toFixed(1)}%`],
    ['Grid emission factor', CO2_FACTOR, 'kg CO₂e / kWh', ''],
    ['Revenue', r.footfall.sales.revenue_myr, 'MYR', `${r.footfall.sales.delta_pct.toFixed(1)}%`],
    ['Transactions', r.footfall.sales.transactions, 'count', ''],
    ['Avg basket size', +txnAvg.toFixed(2), 'MYR/txn', ''],
    ['Footfall (total)', r.footfall.footfall.total, 'visitors', `${r.footfall.footfall.delta_pct.toFixed(1)}%`],
    ['Footfall (daily avg)', r.footfall.footfall.avg_daily, 'visitors/day', ''],
    ['Walk-in → paying conversion', r.footfall.conversion.rate_pct, '%', `${r.footfall.conversion.delta_pp}pp`],
    ['Electricity', r.energy.electricity.kwh, 'kWh', `${r.energy.electricity.delta_pct.toFixed(1)}%`],
    ['Electricity cost', r.energy.electricity.cost_myr, 'MYR', ''],
    ['Water', r.energy.water.m3, 'm³', `${r.energy.water.delta_pct.toFixed(1)}%`],
    ['Water cost', r.energy.water.cost_myr, 'MYR', ''],
    ['Recoverable waste (30d)', r.waste.total_cost_myr, 'MYR', ''],
    ['Avoidable CO₂e from waste', r.waste.total_co2e_kg, 'kg CO₂e', ''],
    ['At-risk products', r.inventory.at_risk, 'items', ''],
    ['Low-stock products', r.inventory.low_stock, 'items', ''],
    ['Open anomalies', r.anomalies.length, 'events', ''],
    ['High-severity anomalies', highCount, 'events', ''],
    [],
    ['OPERATING CONTRIBUTION'],
    ['Revenue', r.footfall.sales.revenue_myr],
    ['− Utilities (electricity + water)', -totalUtilities],
    ['− Recoverable waste', -r.waste.total_cost_myr],
    ['= Operating contribution', +grossMargin.toFixed(2)],
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), 'Summary')

  const trend: (string | number)[][] = [['Date', 'Electricity (kWh)', 'Water (m³)', 'Footfall', 'Revenue (MYR)', 'CO₂e (kg)']]
  r.elecTrend.forEach((e, i) => trend.push([
    e.date, e.value, r.waterTrend[i]?.value ?? 0,
    r.footTrend[i]?.footfall ?? 0, r.footTrend[i]?.revenue_myr ?? 0,
    +(e.value * CO2_FACTOR).toFixed(2),
  ]))
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(trend), 'Daily Trend')

  const zones: (string | number)[][] = [['Zone', 'Electricity (kWh)', 'CO₂e (kg)', 'Est. cost (MYR)', '% of total']]
  r.zones.forEach(z => zones.push([
    z.zone.replace(/_/g, ' '),
    z.value, +(z.value * CO2_FACTOR).toFixed(2),
    z.cost_myr, z.pct,
  ]))
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(zones), 'Electricity by Zone')

  const ph: (string | number)[][] = [['Window', 'Avg visitors']]
  r.peaks.forEach(p => ph.push([p.label, p.avg_count]))
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ph), 'Peak Hours')

  const sp: (string | number)[][] = [['Product', 'SKU', 'Spoiled qty', 'Spoilage cost (MYR)']]
  r.spoilage.forEach(s => sp.push([s.name, s.sku, s.spoiled_qty, s.spoilage_cost_myr]))
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sp), 'Top Spoiling Products')

  const an: (string | number)[][] = [['Metric', 'Zone', 'Severity', 'Sigma (σ)', 'Value', 'Description', 'Timestamp']]
  r.anomalies.forEach(a => an.push([
    a.metric, a.zone ?? '—', a.severity, +a.z_score.toFixed(2), a.value, a.description, a.ts,
  ]))
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(an), 'Anomalies')

  const ws: (string | number)[][] = [['Category', 'Count', 'Cost (MYR)']]
  Object.entries(r.waste.categories).forEach(([cat, v]) =>
    ws.push([cat.replace(/_/g, ' '), v.count, v.cost_myr]))
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ws), 'Waste Breakdown')

  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  saveAs(new Blob([buf], { type: 'application/octet-stream' }),
    `reswatch-insights-${r.days}d-${new Date().toISOString().slice(0, 10)}.xlsx`)
}

const borderStyle = { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC' }
const cellBorders = { top: borderStyle, bottom: borderStyle, left: borderStyle, right: borderStyle }

function mkRow(cells: string[], header = false, widths?: number[]) {
  return new TableRow({
    children: cells.map((c, i) => new TableCell({
      borders: cellBorders,
      width: widths ? { size: widths[i], type: WidthType.DXA } : undefined,
      shading: header ? { fill: '1E40AF', type: ShadingType.CLEAR, color: 'auto' } : undefined,
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      children: [new Paragraph({
        children: [new TextRun({ text: c, bold: header, color: header ? 'FFFFFF' : '000000', size: 20 })],
      })],
    })),
  })
}

function mkTable(headers: string[], rows: string[][], widths: number[]) {
  return new Table({
    width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA },
    columnWidths: widths,
    rows: [mkRow(headers, true, widths), ...rows.map(r => mkRow(r, false, widths))],
  })
}

function p(text: string, opts: { bold?: boolean; size?: number; color?: string } = {}) {
  return new Paragraph({
    children: [new TextRun({ text, bold: opts.bold, size: opts.size ?? 22, color: opts.color })],
  })
}

export async function downloadDocx(r: ExportData) {
  const now = new Date().toLocaleString()
  const co2e = r.energy.electricity.co2e_kg
  const totalUtilities = r.energy.electricity.cost_myr + r.energy.water.cost_myr
  const grossMargin = r.footfall.sales.revenue_myr - totalUtilities - r.waste.total_cost_myr
  const txnAvg = r.footfall.sales.transactions ? r.footfall.sales.revenue_myr / r.footfall.sales.transactions : 0
  const trees = (co2e / 21).toFixed(1)
  const highSev = r.anomalies.filter(a => a.severity === 'HIGH').length

  const doc = new Document({
    styles: {
      default: { document: { run: { font: 'Arial', size: 22 } } },
      paragraphStyles: [
        {
          id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { size: 36, bold: true, font: 'Arial', color: '1E40AF' },
          paragraph: { spacing: { before: 360, after: 180 }, outlineLevel: 0 },
        },
        {
          id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { size: 26, bold: true, font: 'Arial', color: '0F172A' },
          paragraph: { spacing: { before: 280, after: 120 }, outlineLevel: 1 },
        },
      ],
    },
    sections: [{
      properties: {
        page: { size: { width: 12240, height: 15840 }, margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 } },
      },
      children: [
        new Paragraph({ alignment: AlignmentType.LEFT, children: [new TextRun({ text: 'ResWatch Retail', bold: true, size: 28, color: '1E40AF' })] }),
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('Operational Insights Report')] }),
        p(`${r.storeName} · Last ${r.days} days vs prior ${r.days} days`, { color: '555555' }),
        p(`Generated ${now}`, { color: '888888', size: 18 }),

        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun('Executive Summary')] }),
        p(`Total CO₂ emissions reached ${Math.round(co2e).toLocaleString()} kg CO₂e (${r.energy.electricity.delta_pct >= 0 ? '+' : ''}${r.energy.electricity.delta_pct.toFixed(1)}% vs prior period), equivalent to ~${trees} trees needed to offset for a year. Electricity drove ${r.energy.electricity.kwh.toLocaleString()} kWh at ${fmtRM(r.energy.electricity.cost_myr)}; water consumption was ${r.energy.water.m3.toLocaleString()} m³ at ${fmtRM(r.energy.water.cost_myr)}.`),
        p(`Revenue totalled ${fmtRM(r.footfall.sales.revenue_myr)} across ${r.footfall.sales.transactions.toLocaleString()} transactions (avg basket ${fmtRM(txnAvg)}). Footfall was ${r.footfall.footfall.total.toLocaleString()} visitors (${r.footfall.footfall.avg_daily}/day). Walk-in to paying-customer conversion was ${r.footfall.conversion.rate_pct}%.`),
        p(`Recoverable waste this month is ${fmtRM(r.waste.total_cost_myr)}, avoiding ${r.waste.total_co2e_kg} kg CO₂e. Inventory shows ${r.inventory.at_risk} at-risk and ${r.inventory.low_stock} low-stock products. ${r.anomalies.length} open anomalies (${highSev} high severity).`),

        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun('Operating Contribution')] }),
        mkTable(
          ['Revenue', fmtRM(r.footfall.sales.revenue_myr)],
          [
            ['− Utilities (electricity + water)', `− ${fmtRM(totalUtilities)}`],
            ['− Recoverable waste', `− ${fmtRM(r.waste.total_cost_myr)}`],
            ['= Operating contribution', fmtRM(grossMargin)],
          ],
          [4680, 4680],
        ),

        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun('Headline KPIs')] }),
        mkTable(['Metric', 'Value'], [
          ['CO₂ emissions', `${Math.round(co2e).toLocaleString()} kg CO₂e`],
          ['Revenue', fmtRM(r.footfall.sales.revenue_myr)],
          ['Footfall', `${r.footfall.footfall.total.toLocaleString()} (${r.footfall.footfall.avg_daily}/day)`],
          ['Electricity', `${r.energy.electricity.kwh.toLocaleString()} kWh · ${fmtRM(r.energy.electricity.cost_myr)}`],
          ['Water', `${r.energy.water.m3.toLocaleString()} m³ · ${fmtRM(r.energy.water.cost_myr)}`],
          ['At-risk / low-stock', `${r.inventory.at_risk} / ${r.inventory.low_stock}`],
          ['Open anomalies (high sev.)', `${r.anomalies.length} (${highSev})`],
        ], [4680, 4680]),

        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun('Electricity by Zone')] }),
        mkTable(['Zone', 'kWh', 'CO₂e (kg)', 'Cost (RM)', '% of total'],
          r.zones.map(z => [
            z.zone.replace(/_/g, ' '),
            z.value.toLocaleString(),
            (z.value * CO2_FACTOR).toFixed(1),
            z.cost_myr.toFixed(2),
            `${z.pct}%`,
          ]),
          [2340, 1700, 1700, 1700, 1520],
        ),

        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun('Peak Demand Windows')] }),
        mkTable(['Window', 'Avg visitors'],
          r.peaks.map(pk => [pk.label, String(pk.avg_count)]),
          [6240, 3120],
        ),

        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun('Top Spoiling Products')] }),
        mkTable(['Product', 'SKU', 'Spoiled qty', 'Cost (RM)'],
          r.spoilage.map(s => [s.name, s.sku, String(s.spoiled_qty), s.spoilage_cost_myr.toFixed(2)]),
          [3500, 1500, 1500, 2860],
        ),

        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun('Open Anomalies')] }),
        mkTable(['Metric', 'Zone', 'Severity', 'σ', 'Description'],
          r.anomalies.slice(0, 20).map(a => [
            a.metric, a.zone ?? '—', a.severity, a.z_score.toFixed(1), a.description.slice(0, 80),
          ]),
          [1440, 1440, 1200, 800, 4480],
        ),

        p(''),
        p('Generated by ResWatch Retail · Insights module', { color: '888888', size: 18 }),
      ],
    }],
  })

  const blob = await Packer.toBlob(doc)
  saveAs(blob, `reswatch-insights-${r.days}d-${new Date().toISOString().slice(0, 10)}.docx`)
}
