import { UserManager, WebStorageStateStore } from "oidc-client-ts";
import type { User } from "oidc-client-ts";
import { DEV_PROFILE } from "./appProfile";

const authority = import.meta.env.VITE_COGNITO_AUTHORITY as string | undefined;
const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID as string | undefined;
const redirectUri = import.meta.env.VITE_COGNITO_REDIRECT_URI as
  string | undefined;
const logoutRedirectUri = import.meta.env.VITE_COGNITO_LOGOUT_REDIRECT_URI as
  string | undefined;
const hostedUi = import.meta.env.VITE_COGNITO_HOSTED_UI_URL as
  string | undefined;

export const cognitoConfigured = Boolean(
  !DEV_PROFILE &&
  authority &&
  clientId &&
  redirectUri &&
  logoutRedirectUri &&
  hostedUi,
);

function createUserManager() {
  if (!cognitoConfigured) return undefined;
  return new UserManager({
    authority: authority!,
    client_id: clientId!,
    redirect_uri: redirectUri!,
    post_logout_redirect_uri: logoutRedirectUri!,
    response_type: "code",
    scope: "openid email profile",
    disablePKCE: false,
    userStore: new WebStorageStateStore({ store: window.sessionStorage }),
    // The default renew service can fall back to an iframe. Cognito needs the
    // guarded refresh-token path in subscribeToCognitoSession instead.
    automaticSilentRenew: false,
    loadUserInfo: false,
    requestTimeoutInSeconds: 20,
    silentRequestTimeoutInSeconds: 20,
  });
}

const userManager = createUserManager();
let signInCallbackPromise: Promise<CognitoSession | undefined> | undefined;
let refreshPromise: Promise<User | null> | undefined;
let lastLoadedUser: User | null = null;
export type CognitoReturnIntent = "home" | "preview" | "account";
let returnIntent: CognitoReturnIntent | undefined;

function allowedReturnIntent(value: unknown): CognitoReturnIntent | undefined {
  return value === "home" || value === "preview" || value === "account"
    ? value
    : undefined;
}

export function takeCognitoReturnIntent() {
  const intent = returnIntent;
  returnIntent = undefined;
  return intent;
}

const sessionExpiredMessage = "Your session expired. Please sign in again.";

async function freshUser(forceRefresh = false): Promise<User | null> {
  if (!userManager) return null;
  const user = await userManager.getUser();
  lastLoadedUser = user;
  if (!user) return null;
  if (!forceRefresh && !user.expired && (user.expires_in ?? 0) >= 60)
    return user;
  // Cognito does not support prompt=none renewal in an iframe. Renew only a
  // session with a refresh token; otherwise return to the hosted sign-in flow.
  if (!user.refresh_token) return user.expired ? null : user;
  if (!refreshPromise) {
    refreshPromise = userManager
      .signinSilent()
      .then((renewed) => {
        lastLoadedUser = renewed;
        return renewed;
      })
      .finally(() => {
        refreshPromise = undefined;
      });
  }
  return refreshPromise;
}

export type CognitoSession = {
  issuer: string;
  subject: string;
  email?: string;
  accessToken: string;
};

function toSession(user: User | null): CognitoSession | undefined {
  if (!user || user.expired || !user.profile.sub || !user.access_token)
    return undefined;
  return {
    issuer:
      typeof user.profile.iss === "string" ? user.profile.iss : authority!,
    subject: user.profile.sub,
    email:
      typeof user.profile.email === "string" ? user.profile.email : undefined,
    accessToken: user.access_token,
  };
}

export async function loadCognitoSession() {
  if (!userManager) return undefined;
  try {
    const user = await freshUser();
    return toSession(user);
  } catch {
    return undefined;
  }
}

export async function completeCognitoSignIn() {
  if (!userManager) return undefined;
  if (!signInCallbackPromise) {
    returnIntent = undefined;
    signInCallbackPromise = userManager
      .signinRedirectCallback()
      .then((user) => {
        lastLoadedUser = user;
        const session = toSession(user);
        if (session && user?.state && typeof user.state === "object") {
          returnIntent = allowedReturnIntent(
            (user.state as { returnTo?: unknown }).returnTo,
          );
        }
        return session;
      })
      .finally(() => {
        signInCallbackPromise = undefined;
      });
  }
  return signInCallbackPromise;
}

export async function signInWithCognito(
  intent: CognitoReturnIntent = "account",
) {
  if (!userManager) throw new Error("Cognito sign-in is not configured.");
  returnIntent = undefined;
  await userManager.signinRedirect({
    state: { returnTo: allowedReturnIntent(intent) ?? "account" },
  });
}

export async function signOutOfCognito() {
  if (!userManager) return;
  returnIntent = undefined;
  await userManager.removeUser();
  const url = new URL("/logout", hostedUi);
  url.searchParams.set("client_id", clientId!);
  url.searchParams.set("logout_uri", logoutRedirectUri!);
  window.location.assign(url.href);
}

export async function currentAccessToken() {
  if (!userManager) throw new Error("Sign-in is not configured.");
  let user: User | null;
  try {
    user = await freshUser();
  } catch {
    throw new Error(sessionExpiredMessage);
  }
  if (!user || user.expired || !user.access_token)
    throw new Error(sessionExpiredMessage);
  return user.access_token;
}

export function subscribeToCognitoSession(
  onChange: (session: CognitoSession | undefined) => void,
) {
  if (!userManager) return () => {};
  let active = true;
  const onUserLoaded = (user: User) => {
    lastLoadedUser = user;
    onChange(toSession(user));
  };
  const onUserUnloaded = () => {
    lastLoadedUser = null;
    onChange(undefined);
  };
  const onAccessTokenExpiring = () => {
    // Skip without reading storage when no refresh token was loaded. Repeated
    // getUser() calls near expiry can otherwise reschedule the expiring timer.
    if (!lastLoadedUser?.refresh_token) return;
    void freshUser(true)
      .then((user) => {
        if (active) onChange(toSession(user));
      })
      .catch(() => {
        if (active) onChange(undefined);
      });
  };
  userManager.events.addAccessTokenExpiring(onAccessTokenExpiring);
  userManager.events.addAccessTokenExpired(onUserUnloaded);
  userManager.events.addUserLoaded(onUserLoaded);
  userManager.events.addUserUnloaded(onUserUnloaded);
  return () => {
    active = false;
    userManager.events.removeAccessTokenExpiring(onAccessTokenExpiring);
    userManager.events.removeUserLoaded(onUserLoaded);
    userManager.events.removeUserUnloaded(onUserUnloaded);
    userManager.events.removeAccessTokenExpired(onUserUnloaded);
  };
}
