import { describe, expect, it } from "vitest";

import { parseCliConfigDocument } from "../io.ts";
import { envDefaultName, fillEmptyEnvReferences } from "./env.ts";

describe("empty env() takes the setting's own name (env-groups fork)", () => {
  it("names it SUPABASE_ plus the setting's path", () => {
    expect(envDefaultName(["auth", "email", "smtp", "pass"])).toBe("SUPABASE_AUTH_EMAIL_SMTP_PASS");
    expect(envDefaultName(["auth", "external", "google", "secret"])).toBe(
      "SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET",
    );
  });

  it("names a [remotes.<name>] setting like the top-level one", () => {
    expect(envDefaultName(["remotes", "staging", "auth", "site_url"])).toBe(
      "SUPABASE_AUTH_SITE_URL",
    );
  });

  it("fills empty env() and leaves everything else alone", () => {
    expect(
      fillEmptyEnvReferences({
        auth: {
          email: { smtp: { pass: "env()", host: "env(SMTP_HOST)", port: 465, user: "resend" } },
        },
      }),
    ).toEqual({
      auth: {
        email: {
          smtp: {
            pass: "env(SUPABASE_AUTH_EMAIL_SMTP_PASS)",
            host: "env(SMTP_HOST)",
            port: 465,
            user: "resend",
          },
        },
      },
    });
  });

  it("applies whenever config.toml is read", () => {
    const parsed = parseCliConfigDocument('[auth.email.smtp]\npass = "env()"\n', "toml");
    expect(parsed).toEqual({
      auth: { email: { smtp: { pass: "env(SUPABASE_AUTH_EMAIL_SMTP_PASS)" } } },
    });
  });
});
