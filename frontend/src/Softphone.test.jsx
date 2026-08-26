import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import App from "./Softphone";

vi.mock("./lib/sipClient", () => ({
  RingnexSipClient: vi.fn()
}));

describe("Ringnex dialer", () => {
  it("loads the configured server without embedding a password", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "Agent connection" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("webdialer01")).toBeInTheDocument();
    expect(screen.getByText("wss://asterisk.ringnex.co/ws")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Enter SIP password")).toHaveValue("");
  });

  it("keeps calling disabled until SIP registration", () => {
    render(<App />);
    expect(screen.getByRole("button", { name: "Start call" })).toBeDisabled();
    expect(screen.getByText("Connect your SIP account to enable calling.")).toBeInTheDocument();
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
