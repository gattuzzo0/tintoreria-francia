from __future__ import annotations

from functools import lru_cache

import boto3
from botocore.config import Config

from api.config import (
    get_r2_access_key_id,
    get_r2_account_id,
    get_r2_bucket_name,
    get_r2_secret_access_key,
    is_storage_configured,
)

# SigV4 no firma más de 7 días. La caché del 302 es 1 día, así que la firma vive más.
GET_EXPIRES = 7 * 24 * 60 * 60
PUT_EXPIRES = 10 * 60

PAGE_ORIGIN = "https://tintoreria-francia.vercel.app"
LOCAL_ORIGINS = ("http://localhost:3000", "http://127.0.0.1:3000")


@lru_cache
def get_r2():
    if not is_storage_configured():
        raise RuntimeError("R2 no configurado")
    account = get_r2_account_id()
    return boto3.client(
        "s3",
        endpoint_url=f"https://{account}.r2.cloudflarestorage.com",
        aws_access_key_id=get_r2_access_key_id(),
        aws_secret_access_key=get_r2_secret_access_key(),
        region_name="auto",
        config=Config(signature_version="s3v4"),
    )


def object_exists(key: str) -> bool:
    from botocore.exceptions import ClientError

    try:
        get_r2().head_object(Bucket=get_r2_bucket_name(), Key=key)
    except ClientError as exc:
        if exc.response.get("ResponseMetadata", {}).get("HTTPStatusCode") == 404:
            return False
        raise
    return True


def presign_get(key: str) -> str:
    # no-store: la misma URL a veces llega sin Origin y a veces con crossOrigin.
    return get_r2().generate_presigned_url(
        "get_object",
        Params={
            "Bucket": get_r2_bucket_name(),
            "Key": key,
            "ResponseCacheControl": "no-store",
        },
        ExpiresIn=GET_EXPIRES,
    )


def presign_put(key: str, content_type: str) -> str:
    return get_r2().generate_presigned_url(
        "put_object",
        Params={
            "Bucket": get_r2_bucket_name(),
            "Key": key,
            "ContentType": content_type,
        },
        ExpiresIn=PUT_EXPIRES,
    )


def delete_object(key: str) -> None:
    if not key or key.lower().startswith(("http://", "https://")):
        return
    get_r2().delete_object(Bucket=get_r2_bucket_name(), Key=key)


def bucket_cors_rules() -> list[dict]:
    """GET y PUT desde la página y desde localhost. Reglas separadas."""
    origins = [PAGE_ORIGIN, *LOCAL_ORIGINS]
    return [
        {
            "AllowedOrigins": origins,
            "AllowedMethods": ["GET", "HEAD"],
            "AllowedHeaders": ["*"],
            "MaxAgeSeconds": 3600,
        },
        {
            "AllowedOrigins": origins,
            "AllowedMethods": ["PUT"],
            "AllowedHeaders": ["Content-Type"],
            "MaxAgeSeconds": 3600,
        },
    ]


def apply_bucket_cors() -> None:
    get_r2().put_bucket_cors(
        Bucket=get_r2_bucket_name(),
        CORSConfiguration={"CORSRules": bucket_cors_rules()},
    )
