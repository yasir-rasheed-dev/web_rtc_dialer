import React from "react";
import ReactDOM from "react-dom/client";
import App from "./app/App";
import CallWindow from "./pages/call-window/CallWindow";
import TollFreeLiveDashboard from "./pages/toll-free/TollFreeLiveDashboard";
import ModalHost from "./components/ui/ModalHost";
import ToastHost from "./components/ui/ToastHost";
import { ThemeProvider } from "./contexts/ThemeContext";
import "./global.css";
import "./styles.css";
import "./console.css";

// The Electron desktop app's call popup loads this exact same bundle, just
// at "#call-window" instead of the normal root — see electron/main.js's
// createCallWindow(). On the web this hash never appears, so RootView
// always renders <App/> there.
const isCallWindow = window.location.hash.startsWith("#call-window");

// Toll-Free page's "Open Dashboard Mode" button opens this same bundle in
// a new window/tab (window.open, same origin — so sessionStorage's auth
// token is already there at creation time, no extra login step) at
// "#toll-free-live". Same pattern as #call-window above, just a plain
// browser popup instead of an Electron-specific window.
const isTollFreeLive = window.location.hash.startsWith("#toll-free-live");

function RootView() {
  if (isCallWindow) return <CallWindow />;
  if (isTollFreeLive) return <TollFreeLiveDashboard />;
  return <App />;
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ThemeProvider>
      <RootView />
      <ModalHost />
      <ToastHost />
    </ThemeProvider>
  </React.StrictMode>
);
