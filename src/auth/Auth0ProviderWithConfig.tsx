import { Auth0Provider } from "@auth0/auth0-react";
import type { ReactNode } from "react";

/**
 * Wraps the app in Auth0Provider, configured from Vite env vars:
 *   VITE_AUTH0_DOMAIN, VITE_AUTH0_CLIENT_ID, VITE_AUTH0_AUDIENCE
 *
 * The `audience` is required so Auth0 issues an access token (JWT) for our
 * API — the FastAPI backend validates it against AUTH0_API_AUDIENCE.
 */
const Auth0ProviderWithConfig = ({ children }: { children: ReactNode }) => {
  const domain = import.meta.env.VITE_AUTH0_DOMAIN;
  const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID;
  const audience = import.meta.env.VITE_AUTH0_AUDIENCE;

  if (!domain || !clientId || !audience) {
    return (
      <div className="p-6 sm:p-8 max-w-lg mx-auto">
        <div className="bg-white rounded-xl shadow-sm border border-red-100 p-6">
          <h1 className="text-xl font-bold text-red-600 mb-2">Auth0 not configured</h1>
          <p className="text-sm text-black">
            Set <code>VITE_AUTH0_DOMAIN</code>, <code>VITE_AUTH0_CLIENT_ID</code>, and{" "}
            <code>VITE_AUTH0_AUDIENCE</code> in <code>my-app/.env.local</code>, then restart the
            dev server.
          </p>
        </div>
      </div>
    );
  }

  return (
    <Auth0Provider
      domain={domain}
      clientId={clientId}
      authorizationParams={{
        redirect_uri: window.location.origin,
        audience,
      }}
      cacheLocation="localstorage"
    >
      {children}
    </Auth0Provider>
  );
};

export default Auth0ProviderWithConfig;
