import { AnimatePresence, motion } from "framer-motion";
import { PanelLeftClose, PanelLeftOpen, X } from "lucide-react";

export const SIDEBAR_WIDTH = 250;
export const SIDEBAR_WIDTH_COLLAPSED = 76;

export default function Sidebar({ navigation, page, setPage, sidebarOpen, setSidebarOpen, session, amiConnected, collapsed, setCollapsed, badges = {} }) {
  return (
    <>
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 z-20 bg-black/50 lg:hidden"
          />
        )}
      </AnimatePresence>

      <aside
        style={{ "--rn-sidebar-w": `${collapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH}px` }}
        className={`console-sidebar !bg-surface !border-border !shadow-none transition-[width] duration-200 lg:!w-[var(--rn-sidebar-w)] ${sidebarOpen ? "open" : ""}`}
      >
        <div className={`mb-7 flex items-center gap-2.5 px-1 ${collapsed ? "justify-center" : ""}`}>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand text-xs font-bold text-white">
            RN
          </span>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-text">{session.tenant?.name || "Ringnex"}</p>
              <p className="truncate text-[11px] text-muted">{session.tenant?.workspace || "Contact Center"}</p>
            </div>
          )}
          <button
            onClick={() => setSidebarOpen(false)}
            className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-text lg:hidden"
            aria-label="Close menu"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex flex-1 flex-col divide-y divide-border/60 overflow-y-auto overflow-x-hidden">
          {navigation.map(({ id, label, icon: Icon }) => {
            const active = page === id;
            const badgeCount = badges[id] || 0;
            return (
              <button
                key={id}
                title={collapsed ? label : undefined}
                onClick={() => {
                  setPage(id);
                  setSidebarOpen(false);
                }}
                className={`relative flex items-center gap-3 px-3 py-2.5 text-[13px] transition-colors ${
                  collapsed ? "justify-center" : ""
                } ${active ? "font-semibold text-brand" : "font-medium text-text/60 hover:text-text"}`}
              >
                {active && (
                  <motion.span
                    layoutId="sidebar-active"
                    transition={{ type: "spring", stiffness: 480, damping: 38 }}
                    className="absolute inset-0 rounded-lg bg-brand/[0.08]"
                  />
                )}
                <span className="relative shrink-0">
                  <Icon size={16} strokeWidth={2} />
                  {collapsed && badgeCount > 0 && (
                    <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-danger" />
                  )}
                </span>
                {!collapsed && (
                  <span className="relative flex flex-1 items-center justify-between gap-2 text-left">
                    {label}
                    {badgeCount > 0 && (
                      <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-danger px-1.5 text-[10px] font-bold text-white">
                        {badgeCount > 99 ? "99+" : badgeCount}
                      </span>
                    )}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className={`mt-3 flex items-center gap-2.5 border-t border-border px-1 pt-4 ${collapsed ? "justify-center" : ""}`}>
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${amiConnected ? "bg-success" : "bg-muted"}`} />
          {!collapsed && (
            <div className="min-w-0">
              <p className="text-xs font-medium text-text">Asterisk AMI</p>
              <p className="truncate text-[11px] text-muted">{amiConnected ? "Connected" : "Offline"}</p>
            </div>
          )}
        </div>

        <button
          onClick={() => setCollapsed((current) => !current)}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={`mt-3 hidden items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium text-text/60 hover:bg-surface-2 hover:text-text lg:flex ${
            collapsed ? "justify-center" : ""
          }`}
        >
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          {!collapsed && <span>Collapse</span>}
        </button>
      </aside>
    </>
  );
}
