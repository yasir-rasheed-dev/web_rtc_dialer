import Card from "./Card";

const KPI_TONES = {
  blue: "bg-brand/10 text-brand",
  green: "bg-success-soft text-success",
  purple: "bg-violet-500/10 text-violet-500",
  orange: "bg-warning-soft text-warning"
};

export default function KpiCard({ label, value, detail, icon: Icon, tone = "blue" }) {
  return (
    <Card compact className="flex items-start gap-3">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${KPI_TONES[tone] || KPI_TONES.blue}`}>
        <Icon size={16} />
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">{label}</p>
        <p className="mt-0.5 text-xl font-bold tracking-tight text-text">{value}</p>
        <p className="mt-0.5 text-[11px] text-muted">{detail}</p>
      </div>
    </Card>
  );
}
