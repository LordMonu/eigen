export type Role = "master" | "manager" | "head_designer" | "creator";

export function isManagerLikeRole(role: Role | string | null | undefined) {
  return role === "manager" || role === "head_designer";
}

export function isPrivilegedRole(role: Role | string | null | undefined) {
  return role === "master" || isManagerLikeRole(role);
}
