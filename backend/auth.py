"""
JWT authentication for ResWatch Retail.

Uses Supabase-issued JWTs verified against the project JWKS endpoint.
Supports ES256 (current Supabase) and RS256 (for key rotation).

Usage:
    from auth import verify_token
    @router.get("/api/some-endpoint")
    def endpoint(payload: dict = Depends(verify_token)):
        user_id = payload.get("sub")
        ...
"""
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt
from jwt import PyJWKClient
from config import settings

_security = HTTPBearer(auto_error=True)
_jwks_client = PyJWKClient(settings.jwks_url, cache_keys=True)


def verify_token(
    credentials: HTTPAuthorizationCredentials = Depends(_security),
) -> dict:
    """Validates the Bearer JWT and returns the decoded payload."""
    token = credentials.credentials
    try:
        signing_key = _jwks_client.get_signing_key_from_jwt(token)
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["ES256", "RS256"],
            options={"verify_aud": False},
        )
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token expired",
        )
    except jwt.InvalidTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
        )


def get_user_id(payload: dict = Depends(verify_token)) -> str:
    """Extracts the user ID (sub) from a verified JWT payload."""
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token subject")
    return user_id
