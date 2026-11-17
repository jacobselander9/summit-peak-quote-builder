// The customer quote PDF. It only accepts a CustomerQuote (see
// lib/pricing/customer.ts), so cost, markup, margin and the trace can't appear.
import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { formatCents, formatNumber } from "@/lib/pricing/money";
import type { CustomerLine, CustomerOption, CustomerQuote } from "@/lib/pricing/customer";

const NAVY = "#1F3A5F";
const ORANGE = "#E07A2E";
const GREY = "#5b6675";
const LIGHT = "#F3F6FA";

const s = StyleSheet.create({
  page: { paddingTop: 0, paddingBottom: 60, paddingHorizontal: 0, fontSize: 10, color: "#14233a", fontFamily: "Helvetica" },
  header: { backgroundColor: NAVY, color: "white", paddingVertical: 14, paddingHorizontal: 36, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  brand: { fontSize: 20, fontFamily: "Helvetica-Bold" },
  brandSub: { fontSize: 9, color: "#cfd9e6", marginTop: 2 },
  quoteTag: { fontSize: 16, fontFamily: "Helvetica-Bold", color: ORANGE, textAlign: "right" },
  headerMeta: { fontSize: 9, color: "#cfd9e6", textAlign: "right", marginTop: 2 },
  stripe: { height: 4, backgroundColor: ORANGE },
  body: { paddingHorizontal: 36, paddingTop: 14 },
  row: { flexDirection: "row" },
  infoBlock: { flex: 1 },
  label: { fontSize: 8, color: GREY, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 3, fontFamily: "Helvetica-Bold" },
  infoText: { fontSize: 10, marginBottom: 1 },
  optionTitle: { marginTop: 12, fontSize: 14, fontFamily: "Helvetica-Bold", color: NAVY },
  optionKey: { color: ORANGE },
  table: { marginTop: 10 },
  th: { flexDirection: "row", borderBottomWidth: 1.5, borderBottomColor: NAVY, paddingBottom: 4, fontSize: 8, color: GREY, fontFamily: "Helvetica-Bold", textTransform: "uppercase" },
  group: { marginTop: 6, marginBottom: 1, fontSize: 8, fontFamily: "Helvetica-Bold", color: NAVY, textTransform: "uppercase" },
  tr: { flexDirection: "row", paddingVertical: 2.5, borderBottomWidth: 0.5, borderBottomColor: "#dfe5ee" },
  cItem: { flex: 1, paddingRight: 8 },
  cQty: { width: 60, textAlign: "right" },
  cPrice: { width: 80, textAlign: "right" },
  cAmt: { width: 80, textAlign: "right" },
  sku: { fontSize: 8, color: GREY, fontFamily: "Courier" },
  totals: { marginTop: 8, marginLeft: "auto", width: 230, backgroundColor: LIGHT, padding: 10, borderRadius: 4 },
  tRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  tTotal: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1.5, borderTopColor: NAVY, marginTop: 4, paddingTop: 5, fontSize: 13, fontFamily: "Helvetica-Bold", color: NAVY },
  deposit: { flexDirection: "row", justifyContent: "space-between", marginTop: 4, color: ORANGE, fontFamily: "Helvetica-Bold" },
  notes: { marginTop: 12, padding: 8, borderLeftWidth: 3, borderLeftColor: ORANGE, backgroundColor: "#fdf4ec" },
  noteText: { marginBottom: 3 },
  sign: { marginTop: 20, flexDirection: "row", gap: 24 },
  signLine: { flex: 1, borderTopWidth: 1, borderTopColor: "#14233a", paddingTop: 4, fontSize: 9, color: GREY },
  footer: { position: "absolute", bottom: 24, left: 36, right: 36, flexDirection: "row", justifyContent: "space-between", fontSize: 8, color: GREY, borderTopWidth: 0.5, borderTopColor: "#dfe5ee", paddingTop: 6 },
  compare: { marginTop: 14, flexDirection: "row", gap: 10 },
  compareCard: { flex: 1, borderWidth: 1, borderColor: "#dfe5ee", borderRadius: 4, padding: 10 },
  compareName: { fontSize: 10, fontFamily: "Helvetica-Bold", color: NAVY, minHeight: 28 },
  compareTotal: { fontSize: 16, fontFamily: "Helvetica-Bold", color: NAVY, marginTop: 6 },
  checkbox: { marginTop: 8, fontSize: 9 },
});

const TIER: Record<string, string> = { good: "Good", better: "Better", best: "Best", repair: "Repair" };
const GROUPS: { kind: CustomerLine["kind"]; title: string }[] = [
  { kind: "part", title: "Parts & equipment" },
  { kind: "labor", title: "Labor" },
  { kind: "fee", title: "Fees" },
  { kind: "discount", title: "Discount" },
  { kind: "minimum", title: "Minimum service charge" },
];

const longDate = (d: Date) => d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
const money = (cents: number) => (cents < 0 ? `-${formatCents(-cents)}` : formatCents(cents));

export type QuotePdfProps = { quote: CustomerQuote; date: Date };

export function QuotePdf({ quote, date }: QuotePdfProps) {
  const validUntil = new Date(date);
  validUntil.setDate(validUntil.getDate() + quote.validDays);
  const multi = quote.options.length > 1;
  const common = { quote, date, validUntil };

  return (
    <Document title={`Summit Peak HVAC quote${quote.customer.name ? ` for ${quote.customer.name}` : ""}`} author="Summit Peak HVAC (demo)">
      {multi && <SummaryPage {...common} />}
      {quote.options.map((o) => (
        <OptionPage key={o.key} option={o} showSignature={!multi} {...common} />
      ))}
    </Document>
  );
}

type Common = { quote: CustomerQuote; date: Date; validUntil: Date };

function Header({ date, validUntil }: { date: Date; validUntil: Date }) {
  return (
    <View fixed>
      <View style={s.header}>
        <View>
          <Text style={s.brand}>Summit Peak HVAC</Text>
          <Text style={s.brandSub}>Heating & Cooling · Logan, Utah</Text>
        </View>
        <View>
          <Text style={s.quoteTag}>QUOTE</Text>
          <Text style={s.headerMeta}>Date: {longDate(date)}</Text>
          <Text style={s.headerMeta}>Valid until: {longDate(validUntil)}</Text>
        </View>
      </View>
      <View style={s.stripe} />
    </View>
  );
}

function Footer() {
  return (
    <View style={s.footer} fixed>
      <Text>Demo — fictional company and pricing.</Text>
      <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
    </View>
  );
}

function CustomerInfo({ quote }: { quote: CustomerQuote }) {
  const c = quote.customer;
  return (
    <View style={s.row}>
      <View style={s.infoBlock}>
        <Text style={s.label}>Prepared for</Text>
        <Text style={[s.infoText, { fontFamily: "Helvetica-Bold" }]}>{c.name || "Customer"}</Text>
        {c.address ? <Text style={s.infoText}>{c.address}</Text> : null}
        {c.phone ? <Text style={s.infoText}>{c.phone}</Text> : null}
        {c.email ? <Text style={s.infoText}>{c.email}</Text> : null}
      </View>
      <View style={s.infoBlock}>
        <Text style={s.label}>Job</Text>
        <Text style={s.infoText}>{quote.jobDescription}</Text>
        {quote.city ? <Text style={s.infoText}>{quote.city}, Utah</Text> : null}
      </View>
    </View>
  );
}

function Terms({ quote, option, validUntil }: { quote: CustomerQuote; option?: CustomerOption; validUntil: Date }) {
  const { termMonths, apr } = quote.financing;
  const monthly = option ? Math.round(option.totalCents / termMonths) : null;
  return (
    <View style={s.notes} wrap={false}>
      <Text style={s.noteText}>
        Financing: {formatNumber(apr)}% APR for {termMonths} months available on approved credit
        {monthly !== null && quote.jobKind === "install" ? ` (about ${formatCents(monthly)}/month for this option).` : "."}
      </Text>
      {quote.jobKind === "install" && (
        <Text style={s.noteText}>
          A {Math.round(quote.depositPct * 100)}% deposit is due to schedule the installation. The balance is due on completion.
        </Text>
      )}
      <Text>
        This quote is valid for {quote.validDays} days, until {longDate(validUntil)}. Tax applies to parts and equipment only.
      </Text>
    </View>
  );
}

function Signature({ chooseOption }: { chooseOption?: boolean }) {
  return (
    <View wrap={false}>
      {chooseOption && <Text style={{ marginTop: 22, fontSize: 10 }}>Option chosen:   [  ] Good     [  ] Better     [  ] Best</Text>}
      <View style={s.sign}>
        <Text style={[s.signLine, { flex: 2 }]}>Customer signature</Text>
        <Text style={s.signLine}>Date</Text>
      </View>
    </View>
  );
}

function SummaryPage({ quote, date, validUntil }: Common) {
  return (
    <Page size="LETTER" style={s.page}>
      <Header date={date} validUntil={validUntil} />
      <View style={s.body}>
        <CustomerInfo quote={quote} />
        <Text style={s.optionTitle}>Your options</Text>
        <View style={s.compare}>
          {quote.options.map((o) => (
            <View key={o.key} style={s.compareCard}>
              <Text style={[s.label, { color: ORANGE }]}>{TIER[o.key]}</Text>
              <Text style={s.compareName}>{o.name}</Text>
              <Text style={s.compareTotal}>{formatCents(o.totalCents)}</Text>
              <Text style={{ fontSize: 8, color: GREY }}>total incl. tax</Text>
              {o.depositCents !== null && <Text style={s.checkbox}>Deposit {formatCents(o.depositCents)}</Text>}
            </View>
          ))}
        </View>
        <Text style={{ marginTop: 10, color: GREY }}>Each option is itemized on the following pages.</Text>
        <Terms quote={quote} validUntil={validUntil} />
        <Signature chooseOption />
      </View>
      <Footer />
    </Page>
  );
}

function OptionPage({ quote, option, date, validUntil, showSignature }: Common & { option: CustomerOption; showSignature: boolean }) {
  const discount = option.lines.find((l) => l.kind === "discount");
  return (
    <Page size="LETTER" style={s.page}>
      <Header date={date} validUntil={validUntil} />
      <View style={s.body}>
        <CustomerInfo quote={quote} />
        <Text style={s.optionTitle}>
          {quote.options.length > 1 || option.key !== "repair" ? <Text style={s.optionKey}>{TIER[option.key]}: </Text> : null}
          {option.name}
        </Text>

        <View style={s.table}>
          <View style={s.th}>
            <Text style={s.cItem}>Item</Text>
            <Text style={s.cQty}>Qty</Text>
            <Text style={s.cPrice}>Price</Text>
            <Text style={s.cAmt}>Amount</Text>
          </View>
          {GROUPS.map((g) => {
            const lines = option.lines.filter((l) => l.kind === g.kind);
            if (lines.length === 0) return null;
            return (
              <View key={g.kind}>
                <Text style={s.group}>{g.title}</Text>
                {lines.map((l, i) => (
                  <View key={`${l.description}-${i}`} style={s.tr} wrap={false}>
                    <Text style={s.cItem}>
                      {l.description}
                      {l.sku ? <Text style={s.sku}>{`  ${l.sku}`}</Text> : null}
                    </Text>
                    <Text style={s.cQty}>
                      {l.kind === "discount" || l.kind === "minimum" ? "" : `${formatNumber(l.qty)}${l.kind === "labor" ? " hr" : ""}`}
                    </Text>
                    <Text style={s.cPrice}>
                      {l.kind === "discount" || l.kind === "minimum" ? "" : `${formatCents(l.unitPriceCents)}${l.kind === "labor" ? "/hr" : ""}`}
                    </Text>
                    <Text style={s.cAmt}>{money(l.amountCents)}</Text>
                  </View>
                ))}
              </View>
            );
          })}
        </View>

        <View style={s.totals} wrap={false}>
          {discount && (
            <View style={s.tRow}>
              <Text>Discount</Text>
              <Text>{money(discount.amountCents)}</Text>
            </View>
          )}
          <View style={s.tRow}>
            <Text>Subtotal</Text>
            <Text>{formatCents(option.subtotalCents)}</Text>
          </View>
          <View style={s.tRow}>
            <Text>Sales tax (parts & equipment)</Text>
            <Text>{formatCents(option.taxCents)}</Text>
          </View>
          <View style={s.tTotal}>
            <Text>Total</Text>
            <Text>{formatCents(option.totalCents)}</Text>
          </View>
          {option.depositCents !== null && (
            <View style={s.deposit}>
              <Text>Deposit to schedule</Text>
              <Text>{formatCents(option.depositCents)}</Text>
            </View>
          )}
        </View>

        <Terms quote={quote} option={option} validUntil={validUntil} />
        {showSignature && <Signature />}
      </View>
      <Footer />
    </Page>
  );
}
