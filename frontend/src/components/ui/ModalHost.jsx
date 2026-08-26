import { useEffect, useRef, useState } from "react";

import { _bindModalHost } from "../../lib/modal";
import Button from "./Button";
import Modal from "./Modal";

export default function ModalHost() {
  const [modal, setModal] = useState(null);
  const [value, setValue] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    _bindModalHost((config) => {
      setModal(config);
      setValue(config.defaultValue || "");
    });
    return () => _bindModalHost(null);
  }, []);

  useEffect(() => {
    if (modal?.kind === "prompt") {
      requestAnimationFrame(() => inputRef.current?.select());
    }
  }, [modal]);

  const settle = (result) => {
    modal?.resolve(result);
    setModal(null);
  };

  if (!modal) return <Modal open={false} />;

  if (modal.kind === "prompt") {
    return (
      <Modal open onClose={() => settle(null)} title={modal.title}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            settle(value);
          }}
        >
          {modal.label && <label className="mb-1.5 block text-xs font-medium text-muted">{modal.label}</label>}
          <input
            ref={inputRef}
            autoFocus
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={modal.placeholder}
            className="w-full rounded-xl border border-border bg-surface-2 px-3.5 py-2.5 text-sm text-text outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
          />
          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => settle(null)}>
              {modal.cancelText}
            </Button>
            <Button type="submit" variant="primary" size="sm">
              {modal.confirmText}
            </Button>
          </div>
        </form>
      </Modal>
    );
  }

  return (
    <Modal open onClose={() => settle(false)} title={modal.title}>
      {modal.message && <p className="text-sm leading-relaxed text-muted">{modal.message}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={() => settle(false)}>
          {modal.cancelText}
        </Button>
        <Button variant={modal.danger ? "danger" : "primary"} size="sm" onClick={() => settle(true)}>
          {modal.confirmText}
        </Button>
      </div>
    </Modal>
  );
}
