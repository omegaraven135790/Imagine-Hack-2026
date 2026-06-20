from uuid import UUID

from fastapi import Header, HTTPException, status
from pydantic import BaseModel


class TenantScope(BaseModel):
    org_id: UUID
    store_id: UUID


def get_tenant_scope(
    x_org_id: str | None = Header(default=None, alias="X-Org-Id"),
    x_store_id: str | None = Header(default=None, alias="X-Store-Id"),
) -> TenantScope:
    if not x_org_id or not x_store_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="X-Org-Id and X-Store-Id headers are required.",
        )

    try:
        return TenantScope(org_id=UUID(x_org_id), store_id=UUID(x_store_id))
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="X-Org-Id and X-Store-Id must be valid UUIDs.",
        ) from exc
