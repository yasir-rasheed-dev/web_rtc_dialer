import { useEffect, useRef, useState } from "react";
import { DownloadCloud, Loader2, RefreshCw, RotateCw } from "lucide-react";

import { notifyError, notifyInfo, notifySuccess } from "../../lib/toast";

// Header "Check for updates" control — desktop app only. Talks to the
// Electron main process (see electron/updater.js) over the
// window.ringnexDesktop.updates bridge.
//
//  idle        → "Check for updates"      (also refreshes app data)
//  checking    → spinner
//  available   → "Download vX.Y.Z"
//  progress    → "Downloading NN%"
//  downloaded  → "Restart & update"       (NSIS in-app install)
//  manual      → "Get the update"         (macOS: opens the Releases page)
//  uptodate    → brief "Up to date", then back to idle
//
// A small dot marks the button while an update is available or ready.
export default function DesktopUpdater() {
  const api = typeof window !== "undefined" ? window.ringnexDesktop?.updates : null;
  const [phase, setPhase] = useState("idle");
  const [version, setVersion] = useState("");
  const [percent, setPercent] = useState(0);
  const [canSelfInstall, setCanSelfInstall] = useState(true);
  const uptodateTimer = useRef(null);

  useEffect(() => {
    if (!api) return undefined;
    api.state?.().then((s) => {
      if (s && typeof s.canSelfInstall === "boolean") setCanSelfInstall(s.canSelfInstall);
    }).catch(() => {});

    const off = api.onEvent((e) => {
      if (!e || !e.type) return;
      if (e.type === "checking") setPhase("checking");
      else if (e.type === "available") {
        setVersion(e.version || "");
        if (typeof e.canSelfInstall === "boolean") setCanSelfInstall(e.canSelfInstall);
        setPhase("available");
        notifyInfo(`Update available — version ${e.version}`);
      } else if (e.type === "progress") {
        setPercent(e.percent || 0);
        setPhase("progress");
      } else if (e.type === "downloaded") {
        setVersion(e.version || "");
        setPhase("downloaded");
        notifySuccess(`Update ${e.version} ready — restart to install`);
      } else if (e.type === "manual") {
        setPhase("manual");
      } else if (e.type === "not-available") {
        setPhase("uptodate");
        clearTimeout(uptodateTimer.current);
        uptodateTimer.current = setTimeout(() => setPhase("idle"), 3500);
      } else if (e.type === "error") {
        setPhase("error");
        notifyError(e.message ? `Update check failed: ${e.message}` : "Update check failed");
        clearTimeout(uptodateTimer.current);
        uptodateTimer.current = setTimeout(() => setPhase("idle"), 5000);
      }
    });
    return () => {
      off?.();
      clearTimeout(uptodateTimer.current);
    };
  }, [api]);

  if (!api) return null;

  const onClick = () => {
    if (phase === "idle" || phase === "uptodate" || phase === "error") {
      setPhase("checking");
      api.check().then((r) => {
        // No newer packaged build → just refresh the app's data/content.
        if (r && r.ok === false && (r.reason === "dev" || r.reason === "unsupported")) {
          api.reloadApp();
          notifyInfo("Refreshed");
          setPhase("idle");
        }
      }).catch(() => setPhase("idle"));
      // Belt & braces: if nothing new turns up we still want a data refresh.
      setTimeout(() => {
        setPhase((p) => {
          if (p === "uptodate") api.reloadApp();
          return p;
        });
      }, 4000);
    } else if (phase === "available") {
      api.download();
      setPhase(canSelfInstall ? "progress" : "manual");
    } else if (phase === "downloaded") {
      api.install();
    } else if (phase === "manual") {
      api.openReleases();
    }
  };

  const map = {
    idle: { icon: RotateCw, label: "Check for updates", spin: false },
    checking: { icon: Loader2, label: "Checking…", spin: true },
    available: { icon: DownloadCloud, label: `Update ${version}`, spin: false, dot: true },
    progress: { icon: Loader2, label: `Downloading ${percent}%`, spin: true },
    downloaded: { icon: RefreshCw, label: "Restart & update", spin: false, dot: true },
    manual: { icon: DownloadCloud, label: "Get the update", spin: false, dot: true },
    uptodate: { icon: RotateCw, label: "Up to date", spin: false },
    error: { icon: RotateCw, label: "Retry update check", spin: false }
  };
  const s = map[phase] || map.idle;
  const Icon = s.icon;

  return (
    <button
      type="button"
      onClick={onClick}
      title={s.label}
      className="relative hidden items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:border-border-strong hover:text-text sm:flex"
    >
      <Icon size={13} className={s.spin ? "animate-spin" : ""} />
      <span className="hidden md:inline">{s.label}</span>
      {s.dot && (
        <span className="absolute -right-0.5 -top-0.5 flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent/70" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
        </span>
      )}
    </button>
  );
}
