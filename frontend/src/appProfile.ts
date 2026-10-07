// A separate build profile. Production builds never infer free access from
// missing provider settings or a failed account-service request.
export const DEV_PROFILE = import.meta.env.MODE === "dev";

export function getDevWorkspaceId() {
  const key = "taxcalculator.dev.workspace.v1";
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return `dev:${id}`;
}
