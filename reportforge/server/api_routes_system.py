from __future__ import annotations

def register_system_routes(app, cache):
    @app.get("/health", tags=["System"])
    async def _get_health():
        return {"status": "ok", "version": "2.0.0", "cache": cache.stats()}

    @app.get("/cache/stats", tags=["System"])
    async def _get_cache_stats():
        return cache.stats()

    @app.delete("/cache", tags=["System"])
    async def _delete_cache(tenant: str = "default"):
        n = cache.clear(tenant)
        return {"cleared": n, "tenant": tenant}
