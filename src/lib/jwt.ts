import { jwtVerify, SignJWT } from "jose";
import type { AppConfig } from "../config";

export type AccessClaims = { sub: string; sid: string };

export async function signAccessToken(claims: AccessClaims, config: AppConfig): Promise<string> {
  return new SignJWT({ sid: claims.sid })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(`${config.accessTokenMinutes}m`)
    .sign(new TextEncoder().encode(config.jwtSecret));
}

export async function verifyAccessToken(token: string, config: AppConfig): Promise<AccessClaims> {
  const { payload } = await jwtVerify(token, new TextEncoder().encode(config.jwtSecret), {
    algorithms: ["HS256"],
  });
  if (!payload.sub || typeof payload.sid !== "string") {
    throw new Error("Invalid access token");
  }
  return { sub: payload.sub, sid: payload.sid };
}
