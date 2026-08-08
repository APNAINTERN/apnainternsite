/**
 * Local JWT helpers for RDS-backed auth (replaces GoTrue tokens in local mode).
 */
import jwt from "jsonwebtoken";

const SECRET = () => {
  const configured =
    process.env.LOCAL_JWT_SECRET ||
    process.env.JWT_SECRET ||
    "";
  const isProd = Boolean(
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.AWS_EXECUTION_ENV ||
      process.env.NODE_ENV === "production"
  );
  if (!configured.trim() && isProd) {
    throw new Error("LOCAL_JWT_SECRET (or JWT_SECRET) must be set in production");
  }
  return configured.trim() || "ezyintern-local-dev-secret-change-me";
};

export type LocalJwtUser = {
  id: string;
  email: string;
  role?: string;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
};

export function signAccessToken(user: LocalJwtUser, expiresIn: string | number = "12h") {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role || "authenticated",
      app_metadata: user.app_metadata || {},
      user_metadata: user.user_metadata || {},
      aud: "authenticated",
    },
    SECRET(),
    { expiresIn: expiresIn as jwt.SignOptions["expiresIn"], issuer: "ezyintern-local" }
  );
}

export function signRefreshToken(user: LocalJwtUser, expiresIn: string | number = "15d") {
  return jwt.sign({ sub: user.id, typ: "refresh", email: user.email }, SECRET(), {
    expiresIn: expiresIn as jwt.SignOptions["expiresIn"],
    issuer: "ezyintern-local",
  });
}

export function verifyToken(token: string): jwt.JwtPayload | null {
  try {
    return jwt.verify(token, SECRET(), { issuer: "ezyintern-local" }) as jwt.JwtPayload;
  } catch {
    return null;
  }
}

export function userFromPayload(payload: jwt.JwtPayload) {
  return {
    id: String(payload.sub || ""),
    email: String(payload.email || ""),
    aud: "authenticated",
    role: String(payload.role || "authenticated"),
    app_metadata: (payload.app_metadata as Record<string, unknown>) || {},
    user_metadata: (payload.user_metadata as Record<string, unknown>) || {},
    created_at: new Date().toISOString(),
  };
}
