import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ProjectActivity, { describeEvent } from "./ProjectActivity";
import { get } from "../../api/clubPmClient";

jest.mock("../../api/clubPmClient", () => ({ get: jest.fn() }));
jest.mock("./MemberBadge", () => () => null);
jest.mock("./rollup/RollupChips", () => ({ RollupSourceChip: () => null }));

function agentLog(payload) {
  return {
    id: "e1", eventType: "AGENT_EXTERNAL_ACTION", source: "AGENT",
    createdAt: "2026-11-13T12:00:00Z", member: { displayName: "Sam" }, payload,
  };
}
function text(log) {
  const { container } = render(<div>{describeEvent(log)}</div>);
  return container.textContent;
}

describe("AGENT_EXTERNAL_ACTION description", () => {
  test("shows app label, summary and plural recipients", () => {
    expect(text(agentLog({ app: "email", summary: "Sent status update", recipientMemberIds: ["a", "b", "c"] })))
      .toBe("Sam via Claude — Email: Sent status update · 3 recipients");
  });

  test("uses singular for one recipient and hides zero", () => {
    expect(text(agentLog({ app: "slack", summary: "Posted", recipientMemberIds: ["a"] })))
      .toBe("Sam via Claude — Slack: Posted · 1 recipient");
    expect(text(agentLog({ app: "calendar", summary: "Booked", recipientMemberIds: [] })))
      .toBe("Sam via Claude — Calendar: Booked");
  });

  test("missing summary shows only the app label; unknown app is raw", () => {
    expect(text(agentLog({ app: "docs" }))).toBe("Sam via Claude — Docs");
    expect(text(agentLog({ app: "fax", summary: "x" }))).toBe("Sam via Claude — fax: x");
  });

  test("renders HTML in the summary as literal text", () => {
    render(<div data-testid="row">{describeEvent(agentLog({ app: "other", summary: "<script>alert(1)</script><b>hi</b>" }))}</div>);
    const row = screen.getByTestId("row");
    expect(row.textContent).toContain("<script>alert(1)</script><b>hi</b>");
    expect(row.innerHTML).toContain("&lt;script&gt;");
  });
});

test("the AI filter requests AGENT_EXTERNAL_ACTION", async () => {
  get.mockReset();
  get.mockResolvedValue({ items: [], nextCursor: null });
  render(<ProjectActivity projectId="p1" members={[]} />);
  await waitFor(() => expect(get).toHaveBeenCalled());
  fireEvent.click(screen.getByRole("button", { name: /AI/ }));
  await waitFor(() => {
    const url = get.mock.calls[get.mock.calls.length - 1][0];
    expect(decodeURIComponent(url)).toContain("eventType=AI_PLAN_EXECUTED,AGENT_EXTERNAL_ACTION");
  });
});
