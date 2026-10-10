import React, { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { getSlackLinks, deleteSlackLink } from "../../api/clubPmClient";
import { useClubPmAuth } from "../../clubpm/ClubPmAuth";

const relativeFormatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

function relativeTime(date) {
  const timestamp = new Date(date).getTime();
  if (!Number.isFinite(timestamp)) return "";
  const seconds = (timestamp - Date.now()) / 1000;
  for (const [unit, size] of [["year", 31536000], ["month", 2592000], ["day", 86400], ["hour", 3600], ["minute", 60]]) {
    if (Math.abs(seconds) >= size) return relativeFormatter.format(Math.round(seconds / size), unit);
  }
  return "just now";
}

export default function SlackMentions({ entityType, entityId }) {
  const { member } = useClubPmAuth();
  const [result, setResult] = useState({ key: "", links: [] });
  const [unlinking, setUnlinking] = useState([]);
  const inFlight = useRef(new Set());
  const entityKey = JSON.stringify([entityType, entityId, member?.id]);

  useEffect(() => {
    let cancelled = false;
    if (!entityType || !entityId || !member?.id) return undefined;
    getSlackLinks(entityType, entityId)
      .then(links => { if (!cancelled) setResult({ key: entityKey, links: Array.isArray(links) ? links : [] }); })
      .catch(() => { if (!cancelled) setResult({ key: entityKey, links: [] }); });
    return () => { cancelled = true; };
  }, [entityType, entityId, entityKey, member?.id]);

  async function unlink(id) {
    if (inFlight.current.has(id)) return;
    inFlight.current.add(id);
    setUnlinking(current => [...current, id]);
    try {
      await deleteSlackLink(id);
      setResult(current => current.key === entityKey
        ? { ...current, links: current.links.filter(link => link.id !== id) }
        : current);
      toast.success("Slack mention unlinked");
    } catch (error) {
      toast.error(error?.message || "Failed to unlink Slack mention");
    } finally {
      inFlight.current.delete(id);
      setUnlinking(current => current.filter(linkId => linkId !== id));
    }
  }

  const links = result.key === entityKey ? result.links : [];
  if (!links.length) return null;

  return (
    <section className="cpm-slack-mentions" aria-label="Mentioned in Slack">
      <h3 className="cpm-slack-mentions-title">
        <i className="fab fa-slack" aria-hidden="true" /> Mentioned in Slack
      </h3>
      <ul className="cpm-slack-mentions-list">
        {links.map(link => (
          <li key={link.id} className="cpm-slack-mentions-row">
            <div className="cpm-slack-mentions-content">
              <div className="cpm-slack-mentions-meta">
                <strong>#{String(link.channelName).replace(/^#/, "")}</strong>
                <span>· {link.authorName || "Unknown author"}</span>
                <span>· <time dateTime={link.createdAt}>{relativeTime(link.createdAt)}</time></span>
              </div>
              {link.snippet && <p className="cpm-slack-mentions-snippet">{link.snippet}</p>}
              {link.permalink && (
                <a className="cpm-slack-mentions-open" href={link.permalink} target="_blank" rel="noopener noreferrer">
                  Open in Slack <i className="fas fa-external-link-alt" aria-hidden="true" />
                </a>
              )}
            </div>
            {member?.id === link.linkedById && (
              <button type="button" className="cpm-slack-mentions-unlink" aria-label="Unlink" title="Unlink" disabled={unlinking.includes(link.id)} onClick={() => unlink(link.id)}>
                <i className="fas fa-unlink" aria-hidden="true" />
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
