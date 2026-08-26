import { useCallback, useEffect, useState } from "react";
import { Phone, Plus, RefreshCw, Search } from "lucide-react";

import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import Input from "../../components/ui/Input";
import Modal from "../../components/ui/Modal";
import PageHeader from "../../components/ui/PageHeader";
import Select from "../../components/ui/Select";
import { SkeletonTable } from "../../components/ui/Skeleton";
import StatusBadge from "../../components/ui/StatusBadge";
import { api, completeCommioOrder, reserveCommioNumber, searchCommioNumbers } from "../../lib/api";
import { notifyError, notifySuccess } from "../../lib/toast";

function formatDidDisplay(number) {
  const digits = String(number || "").replace(/\D/g, "");
  const local = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (local.length !== 10) return number;
  return `+1 (${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`;
}

const DID_SEARCH_TYPES = [
  { value: "domestic", label: "Local number" },
  { value: "tollfree", label: "Toll-free" }
];

function BuyNumberModal({ open, onClose, onPurchased }) {
  const [searchType, setSearchType] = useState("domestic");
  const [npa, setNpa] = useState("");
  const [state, setState] = useState("");
  const [rateCenter, setRateCenter] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState(null);
  const [searchError, setSearchError] = useState("");

  const [selected, setSelected] = useState(null);
  const [reserving, setReserving] = useState(false);
  const [reserveError, setReserveError] = useState("");
  const [reservation, setReservation] = useState(null); // { orderId, did, price }

  const [confirming, setConfirming] = useState(false);

  const reset = () => {
    setSearchType("domestic");
    setNpa("");
    setState("");
    setRateCenter("");
    setResults(null);
    setSearchError("");
    setSelected(null);
    setReserveError("");
    setReservation(null);
  };

  const close = () => {
    reset();
    onClose();
  };

  const search = async (event) => {
    event.preventDefault();
    setSearching(true);
    setSearchError("");
    setResults(null);
    try {
      const params = { searchType, quantity: 10 };
      if (searchType === "domestic") {
        if (npa.trim()) params.npa = npa.trim();
        if (state.trim()) params.state = state.trim();
        if (rateCenter.trim()) params.rateCenter = rateCenter.trim();
      } else if (npa.trim()) {
        params.npa = npa.trim();
      }
      const numbers = await searchCommioNumbers(params);
      setResults(numbers);
    } catch (requestError) {
      setSearchError(requestError.message);
    } finally {
      setSearching(false);
    }
  };

  const reserve = async (number) => {
    setSelected(number);
    setReserving(true);
    setReserveError("");
    setReservation(null);
    try {
      const payload = await reserveCommioNumber(number.did);
      if (!payload.price) {
        setReserveError("Number reserved, but the price could not be confirmed. Please try again rather than purchase blind.");
        return;
      }
      setReservation(payload);
    } catch (requestError) {
      setReserveError(requestError.message);
    } finally {
      setReserving(false);
    }
  };

  const confirmPurchase = async () => {
    if (!reservation) return;
    setConfirming(true);
    try {
      const result = await completeCommioOrder(reservation.orderId);
      notifySuccess(`Purchased ${formatDidDisplay(reservation.did)}`);
      if (result.routingAssigned === false) {
        notifyError(`Number purchased, but inbound routing could not be assigned automatically: ${result.routingError || "unknown error"}. Contact support to finish setup.`);
      }
      onPurchased();
      close();
    } catch (requestError) {
      notifyError(requestError.message);
    } finally {
      setConfirming(false);
    }
  };

  return (
    <Modal open={open} onClose={close} title="Buy a phone number" width="max-w-2xl">
      {!reservation ? (
        <div className="flex flex-col gap-5">
          <form onSubmit={search} className="flex flex-wrap items-end gap-3">
            <label className="flex w-[170px] flex-col gap-1.5 text-xs font-medium text-muted">
              Type
              <Select
                options={DID_SEARCH_TYPES}
                value={DID_SEARCH_TYPES.find((option) => option.value === searchType)}
                onChange={(option) => setSearchType(option.value)}
              />
            </label>
            <label className="flex w-[120px] flex-col gap-1.5 text-xs font-medium text-muted">
              Area code
              <Input value={npa} onChange={(e) => setNpa(e.target.value.replace(/\D/g, "").slice(0, 3))} placeholder="919" />
            </label>
            {searchType === "domestic" && (
              <>
                <label className="flex w-[90px] flex-col gap-1.5 text-xs font-medium text-muted">
                  State
                  <Input value={state} onChange={(e) => setState(e.target.value.toUpperCase().slice(0, 2))} placeholder="NC" />
                </label>
                <label className="flex min-w-[160px] flex-1 flex-col gap-1.5 text-xs font-medium text-muted">
                  Rate center
                  <Input value={rateCenter} onChange={(e) => setRateCenter(e.target.value)} placeholder="RALEIGH" />
                </label>
              </>
            )}
            <Button type="submit" icon={Search} loading={searching}>
              Search
            </Button>
          </form>

          {searchError && <div className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{searchError}</div>}
          {reserveError && <div className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{reserveError}</div>}

          {results && (
            <div className="flex flex-col gap-2">
              {results.length === 0 ? (
                <EmptyState title="No numbers found" description="Try a different area code, state, or rate center." />
              ) : (
                results.map((number) => (
                  <div
                    key={number.did}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-2 px-4 py-3"
                  >
                    <div>
                      <p className="font-semibold text-text">{formatDidDisplay(number.did)}</p>
                      <p className="text-xs text-muted">
                        {[number.rateCenter, number.state].filter(Boolean).join(", ") || "—"}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={reserving && selected?.did === number.did}
                      disabled={reserving}
                      onClick={() => reserve(number)}
                    >
                      Select
                    </Button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="rounded-xl border border-border bg-surface-2 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Number</p>
            <p className="mt-1 text-lg font-bold text-text">{formatDidDisplay(reservation.did)}</p>
          </div>
          <div className="rounded-xl border border-border bg-surface-2 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Price</p>
            <div className="mt-2 flex flex-col gap-1 text-sm text-text">
              <div className="flex justify-between"><span className="text-muted">Subtotal</span><span>${Number(reservation.price.subtotal ?? 0).toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-muted">Taxes</span><span>${Number(reservation.price.taxes ?? 0).toFixed(2)}</span></div>
              <div className="flex justify-between border-t border-border pt-1 font-semibold"><span>Total</span><span>${Number(reservation.price.total ?? 0).toFixed(2)}</span></div>
            </div>
          </div>
          <p className="text-xs text-muted">
            Confirming will charge your Commio account and automatically configure inbound routing for this number.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setReservation(null)} disabled={confirming}>
              Back
            </Button>
            <Button onClick={confirmPurchase} loading={confirming}>
              Confirm & Buy
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

export default function DidsPage({ permissions = [] }) {
  const [dids, setDids] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [buyOpen, setBuyOpen] = useState(false);
  const canPurchase = permissions.includes("PURCHASE_DIDS");

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    return api("/dids")
      .then((payload) => setDids(payload.dids || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="PHONE NUMBER INVENTORY"
        title="Phone Numbers"
        description="Numbers available to this workspace, ready to assign to an agent."
        actions={
          <>
            <Button variant="secondary" icon={RefreshCw} loading={loading} onClick={load}>
              Refresh
            </Button>
            {canPurchase && (
              <Button icon={Plus} onClick={() => setBuyOpen(true)}>
                Buy Number
              </Button>
            )}
          </>
        }
      />

      {error && <div className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{error}</div>}

      <Card title="Numbers" description={`${dids.length} numbers`} icon={Phone}>
        <div className="overflow-x-auto">
          {loading ? (
            <SkeletonTable rows={6} cols={4} />
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-wide text-muted">
                  <th className="pb-2 pr-4">Number</th>
                  <th className="pb-2 pr-4">Label</th>
                  <th className="pb-2 pr-4">Assigned user</th>
                  <th className="pb-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {dids.map((did) => (
                  <tr key={did.id} className="border-b border-border/60 last:border-0">
                    <td className="py-3 pr-4 font-semibold text-text">{formatDidDisplay(did.number)}</td>
                    <td className="py-3 pr-4 text-muted">{did.label || "—"}</td>
                    <td className="py-3 pr-4 text-muted">{did.assigned_user_name || "Available"}</td>
                    <td className="py-3">
                      <StatusBadge tone={did.status === "ASSIGNED" ? "success" : "neutral"}>{did.status}</StatusBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!loading && !dids.length && <EmptyState title="No numbers yet" description={canPurchase ? "Buy a number to get started." : "Ask your workspace owner to add a number."} />}
        </div>
      </Card>

      {canPurchase && <BuyNumberModal open={buyOpen} onClose={() => setBuyOpen(false)} onPurchased={load} />}
    </div>
  );
}
