import { withAuthenticationRequired } from "@auth0/auth0-react";

export default function ProtectedRoute(Component) {
  return withAuthenticationRequired(Component, {
    onRedirecting: () => <div>Loading...</div>,
  });
}
