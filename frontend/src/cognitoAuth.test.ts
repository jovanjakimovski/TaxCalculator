import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const manager = {
    getUser: vi.fn(),
    signinSilent: vi.fn(),
    signinRedirect: vi.fn(),
    signinRedirectCallback: vi.fn(),
    removeUser: vi.fn(),
    events: {
      addAccessTokenExpiring: vi.fn(),
      addAccessTokenExpired: vi.fn(),
      addUserLoaded: vi.fn(),
      addUserUnloaded: vi.fn(),
      removeAccessTokenExpiring: vi.fn(),
      removeAccessTokenExpired: vi.fn(),
      removeUserLoaded: vi.fn(),
      removeUserUnloaded: vi.fn(),
    },
  };
  return {
    manager,
    UserManager: vi.fn(function () {
      return manager;
    }),
    WebStorageStateStore: vi.fn(function () {
      return {};
    }),
  };
});

vi.mock("oidc-client-ts", () => ({
  UserManager: mocks.UserManager,
  WebStorageStateStore: mocks.WebStorageStateStore,
}));

const issuer = "https://cognito-idp.eu-west-1.amazonaws.com/test-pool";
const validUser = () => ({
  profile: { iss: issuer, sub: "investor-1", email: "investor@test.invalid" },
  access_token: "access-token",
  refresh_token: "refresh-token",
  expired: false,
  expires_in: 600,
});

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv("VITE_COGNITO_AUTHORITY", issuer);
  vi.stubEnv("VITE_COGNITO_CLIENT_ID", "public-client");
  vi.stubEnv("VITE_COGNITO_REDIRECT_URI", "https://app.test/auth/callback");
  vi.stubEnv("VITE_COGNITO_LOGOUT_REDIRECT_URI", "https://app.test/");
  vi.stubEnv(
    "VITE_COGNITO_HOSTED_UI_URL",
    "https://pool.auth.eu-west-1.amazoncognito.com",
  );
  vi.stubGlobal("window", {
    sessionStorage: {},
    location: { assign: vi.fn() },
  });
  mocks.manager.getUser.mockReset().mockResolvedValue(validUser());
  mocks.manager.signinSilent.mockReset().mockResolvedValue(validUser());
  mocks.manager.signinRedirect.mockReset().mockResolvedValue(undefined);
  mocks.manager.signinRedirectCallback
    .mockReset()
    .mockResolvedValue(validUser());
  mocks.manager.removeUser.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Cognito account session", () => {
  it("uses an authorization-code flow with PKCE and session-only token storage", async () => {
    await import("./cognitoAuth");
    expect(mocks.UserManager).toHaveBeenCalledWith(
      expect.objectContaining({
        authority: issuer,
        client_id: "public-client",
        response_type: "code",
        disablePKCE: false,
        automaticSilentRenew: false,
        scope: "openid email profile",
        requestTimeoutInSeconds: 20,
      }),
    );
    expect(mocks.WebStorageStateStore).toHaveBeenCalledWith({
      store: window.sessionStorage,
    });
  });

  it("does not create a partial provider configuration", async () => {
    vi.stubEnv("VITE_COGNITO_HOSTED_UI_URL", "");
    const auth = await import("./cognitoAuth");
    expect(auth.cognitoConfigured).toBe(false);
    expect(mocks.UserManager).not.toHaveBeenCalled();
    expect(await auth.loadCognitoSession()).toBeUndefined();
    await expect(auth.signInWithCognito()).rejects.toThrow(/not configured/);
  });

  it("restores an expired stored session with its existing refresh token", async () => {
    mocks.manager.getUser.mockResolvedValue({
      ...validUser(),
      expired: true,
      expires_in: -10,
    });
    mocks.manager.signinSilent.mockResolvedValue({
      ...validUser(),
      access_token: "renewed-access",
    });
    const auth = await import("./cognitoAuth");
    expect(await auth.loadCognitoSession()).toEqual({
      issuer,
      subject: "investor-1",
      email: "investor@test.invalid",
      accessToken: "renewed-access",
    });
    expect(mocks.manager.signinSilent).toHaveBeenCalledTimes(1);
  });

  it("shares one token refresh across concurrent account requests", async () => {
    mocks.manager.getUser.mockResolvedValue({ ...validUser(), expires_in: 20 });
    let finishRefresh!: (user: ReturnType<typeof validUser>) => void;
    mocks.manager.signinSilent.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishRefresh = resolve;
        }),
    );
    const auth = await import("./cognitoAuth");
    const first = auth.currentAccessToken();
    const second = auth.currentAccessToken();
    await vi.waitFor(() =>
      expect(mocks.manager.signinSilent).toHaveBeenCalledTimes(1),
    );
    finishRefresh({ ...validUser(), access_token: "renewed-access" });
    expect(await Promise.all([first, second])).toEqual([
      "renewed-access",
      "renewed-access",
    ]);
  });

  it("renews at the expiring-event boundary only through an existing refresh token", async () => {
    const auth = await import("./cognitoAuth");
    const onChange = vi.fn();
    const unsubscribe = auth.subscribeToCognitoSession(onChange);
    await auth.loadCognitoSession();
    mocks.manager.getUser.mockResolvedValue({ ...validUser(), expires_in: 60 });
    mocks.manager.signinSilent.mockResolvedValue({
      ...validUser(),
      access_token: "early-renewed",
    });
    const expiring =
      mocks.manager.events.addAccessTokenExpiring.mock.calls[0][0];
    expiring();
    await vi.waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ accessToken: "early-renewed" }),
      ),
    );
    expect(mocks.manager.signinSilent).toHaveBeenCalledTimes(1);
    unsubscribe();
    expect(mocks.manager.events.removeAccessTokenExpiring).toHaveBeenCalledWith(
      expiring,
    );
  });

  it("does not read or renew repeatedly for expiring sessions without a refresh token", async () => {
    const auth = await import("./cognitoAuth");
    const onChange = vi.fn();
    auth.subscribeToCognitoSession(onChange);
    const expiring =
      mocks.manager.events.addAccessTokenExpiring.mock.calls[0][0];
    expiring(); // No loaded user.
    mocks.manager.getUser.mockResolvedValue({
      ...validUser(),
      refresh_token: undefined,
      expires_in: 60,
    });
    await auth.loadCognitoSession();
    const readsBeforeEvent = mocks.manager.getUser.mock.calls.length;
    expiring();
    expiring();
    await Promise.resolve();
    expect(mocks.manager.getUser).toHaveBeenCalledTimes(readsBeforeEvent);
    expect(mocks.manager.signinSilent).not.toHaveBeenCalled();
    mocks.manager.events.addAccessTokenExpired.mock.calls[0][0]();
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it("notifies reauthentication when background refresh fails", async () => {
    const auth = await import("./cognitoAuth");
    const onChange = vi.fn();
    auth.subscribeToCognitoSession(onChange);
    await auth.loadCognitoSession();
    mocks.manager.signinSilent.mockRejectedValue(
      new Error("expired refresh token"),
    );
    mocks.manager.events.addAccessTokenExpiring.mock.calls[0][0]();
    await vi.waitFor(() => expect(onChange).toHaveBeenCalledWith(undefined));
  });

  it("ignores a background refresh result after the subscriber leaves", async () => {
    const auth = await import("./cognitoAuth");
    const onChange = vi.fn();
    const unsubscribe = auth.subscribeToCognitoSession(onChange);
    await auth.loadCognitoSession();
    let finishRefresh!: (user: ReturnType<typeof validUser>) => void;
    mocks.manager.signinSilent.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishRefresh = resolve;
        }),
    );
    mocks.manager.events.addAccessTokenExpiring.mock.calls[0][0]();
    await vi.waitFor(() =>
      expect(mocks.manager.signinSilent).toHaveBeenCalledTimes(1),
    );
    unsubscribe();
    finishRefresh(validUser());
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("never attempts Cognito iframe renewal when there is no renewable session", async () => {
    const auth = await import("./cognitoAuth");
    for (const user of [
      null,
      { ...validUser(), expired: true, refresh_token: undefined },
    ]) {
      mocks.manager.getUser.mockResolvedValue(user);
      expect(await auth.loadCognitoSession()).toBeUndefined();
      await expect(auth.currentAccessToken()).rejects.toThrow(/sign in again/);
    }
    expect(mocks.manager.signinSilent).not.toHaveBeenCalled();
  });

  it("rejects a session without an access token and reports renewal failure usefully", async () => {
    const auth = await import("./cognitoAuth");
    mocks.manager.getUser.mockResolvedValue({
      ...validUser(),
      access_token: "",
    });
    expect(await auth.loadCognitoSession()).toBeUndefined();
    await expect(auth.currentAccessToken()).rejects.toThrow(/sign in again/);
    mocks.manager.getUser.mockResolvedValue({ ...validUser(), expired: true });
    mocks.manager.signinSilent.mockRejectedValue(
      new Error("provider rejected refresh"),
    );
    expect(await auth.loadCognitoSession()).toBeUndefined();
    await expect(auth.currentAccessToken()).rejects.toThrow(/sign in again/);
  });

  it("records only an allow-listed app return intent, without overriding OIDC state", async () => {
    const auth = await import("./cognitoAuth");
    await auth.signInWithCognito("preview");
    expect(mocks.manager.signinRedirect).toHaveBeenLastCalledWith({
      state: { returnTo: "preview" },
    });
    await auth.signInWithCognito("https://other.test" as "account");
    expect(mocks.manager.signinRedirect).toHaveBeenLastCalledWith({
      state: { returnTo: "account" },
    });
  });

  it("handles concurrent callback consumers once and restores intent once", async () => {
    let finishCallback!: (
      user: ReturnType<typeof validUser> & { state: { returnTo: string } },
    ) => void;
    mocks.manager.signinRedirectCallback.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishCallback = resolve;
        }),
    );
    const auth = await import("./cognitoAuth");
    const first = auth.completeCognitoSignIn();
    const second = auth.completeCognitoSignIn();
    finishCallback({ ...validUser(), state: { returnTo: "preview" } });
    expect(
      (await Promise.all([first, second])).every(
        (session) => session?.subject === "investor-1",
      ),
    ).toBe(true);
    expect(mocks.manager.signinRedirectCallback).toHaveBeenCalledTimes(1);
    expect(auth.takeCognitoReturnIntent()).toBe("preview");
    expect(auth.takeCognitoReturnIntent()).toBeUndefined();
  });

  it("ignores arbitrary return URLs and clears callback errors without keeping stale intent", async () => {
    const auth = await import("./cognitoAuth");
    mocks.manager.signinRedirectCallback.mockResolvedValue({
      ...validUser(),
      state: { returnTo: "//other.test" },
    });
    await auth.completeCognitoSignIn();
    expect(auth.takeCognitoReturnIntent()).toBeUndefined();
    mocks.manager.signinRedirectCallback.mockRejectedValue(
      new Error("invalid authorization state"),
    );
    await expect(auth.completeCognitoSignIn()).rejects.toThrow(
      /invalid authorization state/,
    );
    expect(auth.takeCognitoReturnIntent()).toBeUndefined();
    mocks.manager.signinRedirectCallback.mockResolvedValue({
      ...validUser(),
      state: { returnTo: "account" },
    });
    await auth.completeCognitoSignIn();
    expect(auth.takeCognitoReturnIntent()).toBe("account");
  });

  it("clears local tokens before the exact hosted logout redirect", async () => {
    const auth = await import("./cognitoAuth");
    await auth.signOutOfCognito();
    expect(mocks.manager.removeUser).toHaveBeenCalledTimes(1);
    expect(window.location.assign).toHaveBeenCalledWith(
      "https://pool.auth.eu-west-1.amazoncognito.com/logout?client_id=public-client&logout_uri=https%3A%2F%2Fapp.test%2F",
    );
  });
});
