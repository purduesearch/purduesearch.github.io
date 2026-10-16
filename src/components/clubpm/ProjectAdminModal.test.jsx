import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import ProjectAdminModal from "./ProjectAdminModal";
import { useClubPmAuth } from "../../clubpm/ClubPmAuth";
import { get, patch } from "../../api/clubPmClient";

jest.mock("../../clubpm/ClubPmAuth", () => ({ useClubPmAuth: jest.fn() }));
jest.mock("../../api/clubPmClient", () => ({ get: jest.fn(), patch: jest.fn(), post: jest.fn(), del: jest.fn() }));
jest.mock("react-router-dom", () => ({ Link: ({ children, to }) => <a href={to}>{children}</a> }));
jest.mock("react-hot-toast", () => ({ success: jest.fn() }));
jest.mock("./SubProjectRollupSettings", () => () => null);

let project;
beforeEach(() => {
  jest.clearAllMocks();
  project = { id: "p1", name: "Bioastronautics", status: "ACTIVE", type: "ENGINEERING", slackChannelId: "C1", slackChannelName: "bio", channelMemberSlackIds: ["U1"], members: [], children: [] };
  get.mockImplementation(async url => {
    if (url === "/api/projects/p1") return { ...project };
    if (url === "/api/slack/channels") return { channels: [{ id: "C1", name: "bio", botIsMember: true }, { id: "C2", name: "research", botIsMember: true }] };
    return [];
  });
  patch.mockImplementation(async (url, changes) => { project = { ...project, ...changes }; return project; });
});

test("one settings dialog contains project edits, Slack and all admin controls", async () => {
  useClubPmAuth.mockReturnValue({ member: { id: "m1", slackId: "U1", isAdmin: true } });
  render(<ProjectAdminModal projectId="p1" onClose={jest.fn()} onChanged={jest.fn()} />);
  expect(await screen.findByText("Project details")).toBeInTheDocument();
  expect(screen.getAllByRole("dialog")).toHaveLength(1);
  for (const title of ["Slack channel", "Sub-projects", "Members", "Archive or delete"]) {
    expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
  }
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "New name" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(patch).toHaveBeenCalledWith("/api/projects/p1", { name: "New name" }));
  expect(screen.getByRole("dialog", { name: "Project settings" })).toBeInTheDocument();
});

test("channel members can edit and relink Slack without seeing admin controls", async () => {
  useClubPmAuth.mockReturnValue({ member: { id: "m1", slackId: "U1", isAdmin: false } });
  render(<ProjectAdminModal projectId="p1" onClose={jest.fn()} />);
  await screen.findByRole("option", { name: "#research" });
  expect(screen.queryByRole("heading", { name: "Members" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Delete project permanently/ })).not.toBeInTheDocument();
  expect(screen.getByLabelText(/^Public program/)).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Slack channel"), { target: { value: "C2" } });
  await waitFor(() => expect(patch).toHaveBeenCalledWith("/api/projects/p1", { slackChannelId: "C2", slackChannelName: "research" }));
  expect(get).not.toHaveBeenCalledWith("/api/members");
});

