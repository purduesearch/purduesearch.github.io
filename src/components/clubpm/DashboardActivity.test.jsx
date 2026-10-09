import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import DashboardActivity from "./DashboardActivity";
import { get } from "../../api/clubPmClient";

jest.mock("../../api/clubPmClient", () => ({ get: jest.fn() }));
jest.mock("./ProjectActivity", () => ({ describeEvent: log => `${log.member.displayName} completed ${log.payload.taskTitle}` }));

beforeEach(() => get.mockReset());
function show() {
  return render(<MemoryRouter><DashboardActivity memberId="me" /></MemoryRouter>);
}

test("shows contributor activity with a link to project history", async () => {
  get.mockResolvedValue({ items: [{
    id: "event", createdAt: "2026-10-09T12:00:00Z",
    member: { displayName: "Alex" }, payload: { taskTitle: "Build bracket" },
    project: { id: "ares", name: "ARES" },
  }] });
  show();
  expect(await screen.findByText("Alex completed Build bracket")).toBeTruthy();
  expect(screen.getByRole("link", { name: "ARES" }).getAttribute("href"))
    .toBe("/clubpm/projects/ares?tab=insights&view=activity");
  expect(get).toHaveBeenCalledWith("/api/activity/dashboard");
});

test("keeps an empty feed visible", async () => {
  get.mockResolvedValue({ items: [] });
  show();
  expect(await screen.findByText("No recent activity in your projects yet.")).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Activity" })).toBeTruthy();
});

test("offers a retry when loading fails", async () => {
  get.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ items: [] });
  show();
  fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
  await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  expect(await screen.findByText("No recent activity in your projects yet.")).toBeTruthy();
});
