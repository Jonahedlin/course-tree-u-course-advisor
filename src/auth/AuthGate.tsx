import { useAuth0 } from "@auth0/auth0-react";
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { useApi } from "../lib/api";
import LoginPage from "../Pages/LoginPage";

/**
 * Gates the whole app behind Auth0:
 *  - while Auth0 initialises → spinner
 *  - logged out → login / signup screen
 *  - logged in → ensures a backend user record exists (idempotent
 *    POST /users/register), then renders the app.
 */
const AuthGate = ({ children }: { children: ReactNode }) => {
  const { isLoading, isAuthenticated, error, getIdTokenClaims } = useAuth0();
  const api = useApi();
  const registered = useRef(false);

  useEffect(() => {
    if (isAuthenticated && !registered.current) {
      registered.current = true;
      // Create the backend user row if it's their first login. The access
      // token alone carries no email claim (Auth0's default for a custom API
      // audience), so the ID token is sent too — the backend verifies it
      // server-side and uses it to link accounts across login connections
      // (e.g. password vs Google) that share the same verified email.
      getIdTokenClaims()
        .then((claims) =>
          api("/users/register", { method: "POST", body: { id_token: claims?.__raw } }),
        )
        .catch((e) => {
          console.error("register failed", e);
          registered.current = false;
        });
    }
  }, [isAuthenticated, api, getIdTokenClaims]);

  if (isLoading) {
    return (
      <div className="min-h-dvh flex items-center justify-center text-black text-sm">
        Loading…
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <p className="text-red-600 text-sm">Auth error: {error.message}</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return <>{children}</>;
};

export default AuthGate;
