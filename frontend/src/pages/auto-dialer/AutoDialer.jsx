import { useState } from "react";
import { BarChart3, PhoneForwarded } from "lucide-react";

import EmptyState from "../../components/ui/EmptyState";
import DialerPanel from "./DialerPanel";
import CampaignsPanel from "./CampaignsPanel";

export default function AutoDialer({ permissions = [], sipReady = false }) {
  const canDial = permissions.includes("USE_AUTO_DIALER");
  const canManage = ["VIEW_CAMPAIGNS", "CREATE_CAMPAIGNS", "MANAGE_CAMPAIGNS", "UPLOAD_CONTACTS", "ASSIGN_CONTACTS", "VIEW_CAMPAIGN_REPORTS"]
    .some((key) => permissions.includes(key));

  const [tab, setTab] = useState(canDial ? "dialer" : "campaigns");

  if (!canDial && !canManage) {
    return (
      <div className="flex flex-col gap-6">
        <EmptyState icon={PhoneForwarded} title="Auto dialer is not enabled for your role." />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {canDial && canManage && (
        <div className="flex gap-1 border-b border-border">
          <button
            type="button"
            onClick={() => setTab("dialer")}
            className={`flex items-center gap-1.5 border-b-2 px-3 pb-2.5 text-sm font-medium transition-colors ${
              tab === "dialer" ? "border-brand text-brand" : "border-transparent text-muted hover:text-text"
            }`}
          >
            <PhoneForwarded size={14} />
            Dialer
          </button>
          <button
            type="button"
            onClick={() => setTab("campaigns")}
            className={`flex items-center gap-1.5 border-b-2 px-3 pb-2.5 text-sm font-medium transition-colors ${
              tab === "campaigns" ? "border-brand text-brand" : "border-transparent text-muted hover:text-text"
            }`}
          >
            <BarChart3 size={14} />
            Campaigns
          </button>
        </div>
      )}
      {canDial && (!canManage || tab === "dialer") ? (
        <DialerPanel permissions={permissions} sipReady={sipReady} />
      ) : (
        <CampaignsPanel permissions={permissions} />
      )}
    </div>
  );
}
