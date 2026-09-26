import React, { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { getVaultSubscription, setVaultSubscription, unwatchVaultItem } from "../../../api/clubPmClient";

// Per-item subscription. Watching = at least one of the three events on.
// How a notice arrives (Constellation, Slack DM, both, off) is the member's
// per-type choice in Notification preferences, not something set here.
const EVENTS = [
  { key: "checkins", label: "New check-ins" },
  { key: "decisions", label: "Change request decisions" },
  { key: "conflicts", label: "Checkout conflicts" },
];

export default function VaultWatchButton({ itemId }) {
  const [sub, setSub] = useState(null);
  const [open, setOpen] = useState(false);
  const inFlight = useRef(false);

  useEffect(() => {
    let cancelled = false;
    getVaultSubscription(itemId)
      .then((data) => { if (!cancelled) setSub(data); })
      .catch(() => { if (!cancelled) setSub({ watching: false, checkins: false, decisions: false, conflicts: false, watchers: 0 }); });
    return () => { cancelled = true; };
  }, [itemId]);

  async function save(next) {
    if (inFlight.current) return;
    inFlight.current = true;
    const previous = sub;
    setSub((current) => ({ ...current, ...next, watching: next.checkins || next.decisions || next.conflicts }));
    try {
      const saved = next.checkins || next.decisions || next.conflicts
        ? await setVaultSubscription(itemId, next)
        : await unwatchVaultItem(itemId);
      setSub((current) => ({ ...saved, watchers: (current?.watchers ?? 0) + (saved.watching === !!previous?.watching ? 0 : saved.watching ? 1 : -1) }));
    } catch (err) {
      setSub(previous);
      toast.error(err.message || "Could not update watch settings");
    } finally {
      inFlight.current = false;
    }
  }

  if (!sub) return null;
  const toggle = () => save(sub.watching
    ? { checkins: false, decisions: false, conflicts: false }
    : { checkins: true, decisions: true, conflicts: true });

  return (
    <div className="cpm-vault-watch" data-tour-id="vault.watch">
      <button
        type="button"
        className={`cpm-vault-btn-ghost${sub.watching ? " active" : ""}`}
        aria-pressed={sub.watching}
        onClick={toggle}
        title={sub.watchers ? `${sub.watchers} watching` : undefined}
      >
        <i className={sub.watching ? "fas fa-eye" : "far fa-eye"} aria-hidden="true" /> {sub.watching ? "Watching" : "Watch"}
        {sub.watchers > 0 && <b className="cpm-vault-watch-count">{sub.watchers}</b>}
      </button>
      <button
        type="button"
        className="cpm-vault-btn-ghost cpm-vault-watch-more"
        aria-expanded={open}
        aria-label="Choose what to be notified about"
        onClick={() => setOpen((o) => !o)}
      >
        <i className="fas fa-chevron-down" aria-hidden="true" />
      </button>
      {open && (
        <fieldset className="cpm-vault-watch-menu">
          <legend>Notify me about</legend>
          {EVENTS.map((e) => (
            <label key={e.key}>
              <input
                type="checkbox"
                checked={!!sub[e.key]}
                onChange={(ev) => save({ checkins: sub.checkins, decisions: sub.decisions, conflicts: sub.conflicts, [e.key]: ev.target.checked })}
              />
              {e.label}
            </label>
          ))}
          <div className="cpm-vault-watch-hint">Delivery follows your notification preferences.</div>
        </fieldset>
      )}
    </div>
  );
}
