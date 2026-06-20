"""
Multi-store tenancy resolution for ResWatch Retail.

Every API request that operates on store data must call `get_store_id()` to
resolve which store is being accessed. The store_id flows from the request
header `X-Store-Id`. All queries then filter by that store_id, so data from
different stores never leaks across requests.

Usage in a router:
    from tenancy import get_store_id
    @router.get("/api/some-endpoint")
    def endpoint(store_id: str = Depends(get_store_id), ...):
        # use store_id to scope all queries
"""

from fastapi import Depends, Header, HTTPException, status
from sqlmodel import Session, select

from auth import verify_token
from database import get_session
from models import Store


def get_store_id(
    x_store_id: str = Header(..., alias="X-Store-Id"),
    _payload: dict = Depends(verify_token),
) -> str:
    """
    Resolves the active store from the X-Store-Id request header.
    Requires a valid JWT (verify_token). Returns the store_id string.
    """
    return x_store_id


def get_store(
    store_id: str = Depends(get_store_id),
    session: Session = Depends(get_session),
) -> Store:
    """
    Resolves the full Store record for the active store.
    Raises 404 if the store doesn't exist in the database.
    """
    store = session.exec(select(Store).where(Store.id == store_id)).first()
    if not store:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Store {store_id!r} not found",
        )
    return store
