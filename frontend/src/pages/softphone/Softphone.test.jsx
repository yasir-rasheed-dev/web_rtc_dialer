import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import App from "./Softphone";

vi.mock("../../lib/sipClient", () => ({
  RingnexSipClient: vi.fn()
}));

describe("Ringnex dialer", () => {
  it("loads the configured server without embedding a password", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "Agent connection" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("webdialer01")).toBeInTheDocument();
    // The WSS URL is an editable field now — assert on its value, and match
    // whatever VITE_WSS_URL the build is configured with.
    expect(screen.getByDisplayValue(/^wss:\/\/asterisk\.ringnex\.co\//)).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Enter SIP password")).toHaveValue("");
  });

  it("keeps calling disabled until SIP registration", () => {
    render(<App />);
    expect(screen.getByRole("button", { name: "Start call" })).toBeDisabled();
  });

  it("accepts keypad input", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Dial 1" }));
    await user.click(screen.getByRole("button", { name: "Dial 2" }));
    await user.click(screen.getByRole("button", { name: "Dial 3" }));
    expect(screen.getByRole("textbox", { name: "Phone number" })).toHaveValue("123");
  });

  it("does not attempt registration without a SIP password", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Connect account" }));
    expect(screen.getByText("SIP username and SIP password are required.")).toBeInTheDocument();
  });
});
