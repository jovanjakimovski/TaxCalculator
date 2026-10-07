const API = import.meta.env.VITE_API_URL ?? "/api";
const CREDENTIAL_STORAGE_KEY = "taxcalculator.license.credential.v1";
const CREDENTIAL_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export type Entitlement = {
  credits: number;
  testCodeEnabled: boolean;
  checkoutEnabled: boolean;
  accountMode: boolean;
};

export function getLicenseCredential() {
  const existing = window.localStorage.getItem(CREDENTIAL_STORAGE_KEY);
  if (existing && CREDENTIAL_PATTERN.test(existing)) return existing;

  const bytes = window.crypto.getRandomValues(new Uint8Array(32));
  const credential = window
    .btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
  window.localStorage.setItem(CREDENTIAL_STORAGE_KEY, credential);
  return credential;
}

export function saveLicenseCredential(credential: string) {
  const normalized = credential.trim();
  if (!CREDENTIAL_PATTERN.test(normalized)) {
    throw new Error("The license key format is not valid.");
  }
  window.localStorage.setItem(CREDENTIAL_STORAGE_KEY, normalized);
  return normalized;
}

export function clearLicenseCredential() {
  window.localStorage.removeItem(CREDENTIAL_STORAGE_KEY);
}

async function licenseRequest<T>(
  credential: string,
  path: string,
  init: RequestInit = {},
) {
  const response = await fetch(`${API}/license${path}`, {
    signal: AbortSignal.timeout(30_000),
    ...init,
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${credential}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  if (!response.ok) {
    const result = (await response.json().catch(() => undefined)) as
      { error?: string } | undefined;
    throw new Error(
      result?.error ?? `License service returned ${response.status}.`,
    );
  }
  return response.json() as Promise<T>;
}

export function getEntitlement(credential: string) {
  return licenseRequest<Entitlement>(credential, "/entitlement");
}

export function redeemTestCode(credential: string, code: string) {
  return licenseRequest<Entitlement>(credential, "/test-code", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

export function consumeReportCredit(credential: string, requestId: string) {
  return licenseRequest<Entitlement>(credential, "/reports/consume", {
    method: "POST",
    body: JSON.stringify({ requestId }),
  });
}

export function createCheckout(credential: string, reports = 1) {
  return licenseRequest<{ url: string }>(credential, "/checkout", {
    method: "POST",
    body: JSON.stringify({ reports }),
  });
}

export type LicenseConfig = {
  accountMode: boolean;
  testCodeEnabled: boolean;
  checkoutEnabled: boolean;
  packages: number[];
};
export async function getLicenseConfig(): Promise<LicenseConfig> {
  const response = await fetch(`${API}/license/config`, {
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok)
    throw new Error("Account service is unavailable. Please retry shortly.");
  return response.json();
}

export function linkLegacyLicense(idToken: string, licenseKey: string) {
  return licenseRequest<Entitlement>(idToken, "/account/link-legacy-key", {
    method: "POST",
    body: JSON.stringify({ licenseKey }),
  });
}
