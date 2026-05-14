import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FormEvent } from "react";

import { AuthFormField } from "./auth-form-field";
import { AuthPasswordInput } from "./auth-password-input";

describe("auth form field", () => {
  it(
    "renders the label and error state with shadcn field primitives",
    {
      timeout: 1000,
    },
    () => {
      render(
        <AuthFormField
          label="Email"
          htmlFor="email"
          errorText="Email is required"
        >
          <input id="email" aria-invalid />
        </AuthFormField>
      );

      expect(screen.getByText("Email")).toBeInTheDocument();
      expect(screen.getByText("Email is required")).toBeInTheDocument();
      expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid");
    }
  );

  it(
    "attaches description and errors to nested password inputs",
    {
      timeout: 1000,
    },
    () => {
      render(
        <AuthFormField
          label="Password"
          htmlFor="password"
          descriptionText="Private to your account."
          errorText="Use at least 8 characters."
        >
          <AuthPasswordInput
            id="password"
            name="password"
            autoComplete="new-password"
            value="short"
            onChange={() => {}}
          />
        </AuthFormField>
      );

      const password = screen.getByLabelText("Password");

      expect(password).toHaveAttribute("aria-describedby");
      expect(password.getAttribute("aria-describedby")).toContain(
        "password-description"
      );
      expect(password.getAttribute("aria-describedby")).toContain(
        "password-error"
      );
      expect(password).toHaveAttribute("autocomplete", "new-password");
    }
  );

  it(
    "toggles password visibility without submitting the parent form",
    {
      timeout: 1000,
    },
    async () => {
      const user = userEvent.setup();
      const handleSubmit = vi.fn<(event: FormEvent<HTMLFormElement>) => void>(
        (event) => {
          event.preventDefault();
        }
      );

      render(
        <form onSubmit={handleSubmit}>
          <AuthFormField label="Password" htmlFor="password">
            <AuthPasswordInput
              id="password"
              name="password"
              autoComplete="current-password"
              defaultValue="password123"
            />
          </AuthFormField>
        </form>
      );

      const password = screen.getByLabelText("Password");
      const toggle = screen.getByRole("button", { name: "Show password" });

      expect(password).toHaveAttribute("type", "password");
      expect(password).toHaveAttribute("name", "password");
      expect(password).toHaveValue("password123");
      expect(password).toHaveAttribute("autocomplete", "current-password");

      await user.click(toggle);

      expect(handleSubmit).not.toHaveBeenCalled();
      expect(password).toHaveAttribute("type", "text");
      expect(password).toHaveAttribute("name", "password");
      expect(password).toHaveValue("password123");
      expect(password).toHaveAttribute("autocomplete", "current-password");
      expect(
        screen.getByRole("button", { name: "Hide password" })
      ).toHaveAttribute("aria-pressed", "true");
    }
  );
});
