import Card from "./Card";

const KPI_TONES = {
  blue: "bg-brand/10 text-brand",
  green: "bg-success-soft text-success",
  purple: "bg-violet-500/10 text-violet-500",
  orange: "bg-warning-soft text-warning"
};

export default function KpiCard({ label, value, detail, icon: Icon, tone = "blue" }) {
  return (
    <Card className="flex items-start gap-4">
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${KPI_TONES[tone] || KPI_TONES.blue}`}>
        <Icon size={19} />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</p>
        <p className="mt-1 text-2xl font-bold tracking-tight text-text">{value}</p>
        <p className="mt-0.5 text-xs text-muted">{detail}</p>
      </div>
    </Card>
  );
}
