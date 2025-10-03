from collections.abc import Callable
from typing import Any, Literal, Protocol

from pydantic import BaseModel, Field


class AppwriteHeaders(BaseModel):
    """Appwrite request headers"""

    x_appwrite_trigger: Literal["http", "schedule", "event"] | None = Field(
        None, alias="x-appwrite-trigger"
    )
    x_appwrite_event: str | None = Field(None, alias="x-appwrite-event")
    x_appwrite_key: str | None = Field(None, alias="x-appwrite-key")
    x_appwrite_user_id: str | None = Field(None, alias="x-appwrite-user-id")
    x_appwrite_user_jwt: str | None = Field(None, alias="x-appwrite-user-jwt")
    x_appwrite_country_code: str | None = Field(None, alias="x-appwrite-country-code")
    x_appwrite_continent_code: str | None = Field(
        None, alias="x-appwrite-continent-code"
    )
    x_appwrite_continent_eu: str | None = Field(None, alias="x-appwrite-continent-eu")

    # Allow additional headers
    model_config = {"extra": "allow", "populate_by_name": True}


class AppwriteEnv(BaseModel):
    """Appwrite environment variables"""

    APPWRITE_FUNCTION_API_ENDPOINT: str
    APPWRITE_VERSION: str
    APPWRITE_REGION: str
    APPWRITE_FUNCTION_API_KEY: str | None = None
    APPWRITE_FUNCTION_ID: str
    APPWRITE_FUNCTION_NAME: str
    APPWRITE_FUNCTION_DEPLOYMENT: str
    APPWRITE_FUNCTION_PROJECT_ID: str
    APPWRITE_FUNCTION_RUNTIME_NAME: str
    APPWRITE_FUNCTION_RUNTIME_VERSION: str


class AppwriteRequest(Protocol):
    """Appwrite function request object with proper callable typing"""

    bodyText: str | None
    bodyJson: dict[str, Any] | str | None
    body: Any
    headers: dict[str, str]
    scheme: Literal["http", "https"] | None
    method: Literal["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"]
    url: str | None
    host: str | None
    port: int | str | None
    path: str | None
    queryString: str | None
    query: dict[str, str | list[str]] | None
    variables: dict[str, str] | None
    payload: str | None

    async def text(self) -> str: ...


class AppwriteResponse(Protocol):
    """Appwrite function response object with proper callable typing"""

    def json(
        self,
        data: Any,
        status: int | None = None,
        headers: dict[str, str] | None = None,
    ) -> None: ...

    def text(
        self,
        body: str,
        status: int | None = None,
        headers: dict[str, str] | None = None,
    ) -> None: ...

    def empty(self) -> None: ...

    def binary(self, data: bytes) -> None: ...

    def redirect(self, url: str, status: int | None = None) -> None: ...


class AppwriteContext(Protocol):
    """Complete Appwrite function context with proper typing"""

    req: AppwriteRequest
    res: AppwriteResponse

    def log(self, message: str) -> None: ...

    def error(self, message: str) -> None: ...


# Alternative: BaseModel version for cases where you need Pydantic features
# but want proper typing hints


class AppwriteRequestModel(BaseModel):
    """Pydantic model for request validation (if needed)"""

    bodyText: str | None = None
    bodyJson: dict[str, Any] | str | None = None
    body: Any = None
    headers: dict[str, str] = Field(default_factory=dict)
    scheme: Literal["http", "https"] | None = None
    method: Literal["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"]
    url: str | None = None
    host: str | None = None
    port: int | str | None = None
    path: str | None = None
    queryString: str | None = None
    query: dict[str, str | list[str]] | None = None
    variables: dict[str, str] | None = None
    payload: str | None = None

    model_config = {"arbitrary_types_allowed": True}


# Type alias for the log/error functions
LogFunction = Callable[[str], None]
ErrorFunction = Callable[[str], None]