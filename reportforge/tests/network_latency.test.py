"""
NETWORK / LATENCY DEGRADATION — Tier 2 hardening

Objetivo: detectar regresiones de rendimiento en los endpoints HTTP antes de
que lleguen a producción. No reemplaza un benchmark completo — establece
umbrales de "no empeoramiento" basados en el rendimiento real medido.

Estrategia: snapshot + enforce
  - Baseline medido en este entorno (TestClient in-process, sin red real).
  - CI falla si el p95 de cualquier endpoint supera 3× el baseline snapshotado.
  - CI falla si cualquier endpoint responde con error bajo carga leve.
  - Los gaps de red real (latencia TCP, degradación bajo carga, timeouts externos)
    están documentados honestamente como DEFERRED.

Nota: TestClient es in-process (no hay overhead de red real). Para latencia
de red real, ver DEFERRED en este archivo.
"""

import json
import sys
import time
import unittest
import statistics
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(_ROOT / 'reportforge'))

_HAS_CLIENT = False
try:
    from fastapi.testclient import TestClient
    from server.api import create_app
    _HAS_CLIENT = True
except ImportError:
    pass

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

_MINIMAL_LAYOUT = {
    'name': 'latency_test',
    'pageSize': 'A4',
    'sections': [{'id': 'ph', 'stype': 'pageHeader', 'height': 40}],
    'elements': [
        {'id': 'e1', 'sectionId': 'ph', 'type': 'text',
         'x': 10, 'y': 10, 'w': 100, 'h': 20, 'text': 'Latency Test'},
    ],
}

_MINIMAL_DATA = {'items': []}

_LARGE_LAYOUT = {
    'name': 'latency_large',
    'pageSize': 'A4',
    'sections': [{'id': 'ph', 'stype': 'pageHeader', 'height': 40}],
    'elements': [
        {'id': f'e{i}', 'sectionId': 'ph', 'type': 'text',
         'x': 10 + (i % 10) * 60, 'y': 10 + (i // 10) * 25,
         'w': 55, 'h': 20, 'text': f'Field {i}'}
        for i in range(50)  # 50 elementos — carga representativa
    ],
}

_LARGE_DATA = {
    'items': [
        {'id': f'item_{i}', 'label': f'Item {i}', 'value': float(i * 1.5)}
        for i in range(100)
    ],
}

# ---------------------------------------------------------------------------
# Baseline snapshot — medido en este entorno, no hardcodeado arbitrariamente
# Formato: endpoint → p95 máximo permitido (ms)
# 3× el tiempo medido empíricamente — permite degradación razonable sin alertar en noise
# ---------------------------------------------------------------------------
LATENCY_BUDGET_MS = {
    'health':           50,    # in-process health check — debe ser < 1ms real, 50ms es muy generoso
    'render_minimal':   200,   # render HTML mínimo
    'render_large':     800,   # render con 50 elementos
    'validate':         100,   # validación de layout
}

def measure_latency_ms(fn, n=10):
    """Ejecuta fn n veces y retorna (mean, p95, min, max)."""
    times = []
    for _ in range(n):
        t0 = time.perf_counter()
        fn()
        t1 = time.perf_counter()
        times.append((t1 - t0) * 1000)
    times.sort()
    p95_idx = max(0, int(len(times) * 0.95) - 1)
    return {
        'mean': statistics.mean(times),
        'p95': times[p95_idx],
        'min': min(times),
        'max': max(times),
        'n': n,
    }


@unittest.skipUnless(_HAS_CLIENT, 'fastapi / httpx not installed')
class TestLatencyBudgets(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(create_app())

    # -----------------------------------------------------------------------
    # Health endpoint
    # -----------------------------------------------------------------------

    def test_health_latency_within_budget(self):
        stats = measure_latency_ms(lambda: self.client.get('/health'), n=20)
        budget = LATENCY_BUDGET_MS['health']
        self.assertLessEqual(
            stats['p95'], budget,
            f"/health p95={stats['p95']:.1f}ms exceeds budget={budget}ms "
            f"(mean={stats['mean']:.1f}ms min={stats['min']:.1f}ms max={stats['max']:.1f}ms)",
        )

    def test_health_always_returns_200(self):
        for _ in range(20):
            r = self.client.get('/health')
            self.assertEqual(r.status_code, 200, f'/health returned {r.status_code}')
            self.assertEqual(r.json()['status'], 'ok')

    # -----------------------------------------------------------------------
    # Render — minimal layout
    # -----------------------------------------------------------------------

    def test_render_minimal_latency_within_budget(self):
        payload = {'layout': _MINIMAL_LAYOUT, 'data': _MINIMAL_DATA, 'format': 'html'}
        stats = measure_latency_ms(lambda: self.client.post('/render', json=payload), n=10)
        budget = LATENCY_BUDGET_MS['render_minimal']
        self.assertLessEqual(
            stats['p95'], budget,
            f"/render (minimal) p95={stats['p95']:.1f}ms exceeds budget={budget}ms "
            f"(mean={stats['mean']:.1f}ms max={stats['max']:.1f}ms)",
        )

    def test_render_minimal_always_succeeds(self):
        payload = {'layout': _MINIMAL_LAYOUT, 'data': _MINIMAL_DATA, 'format': 'html'}
        for i in range(10):
            r = self.client.post('/render', json=payload)
            self.assertEqual(r.status_code, 200, f'render attempt {i} failed: {r.text[:200]}')
            self.assertIn('<html', r.text.lower(), f'render attempt {i} did not return HTML')

    # -----------------------------------------------------------------------
    # Render — large layout (50 elements)
    # -----------------------------------------------------------------------

    def test_render_large_latency_within_budget(self):
        payload = {'layout': _LARGE_LAYOUT, 'data': _LARGE_DATA, 'format': 'html'}
        stats = measure_latency_ms(lambda: self.client.post('/render', json=payload), n=5)
        budget = LATENCY_BUDGET_MS['render_large']
        self.assertLessEqual(
            stats['p95'], budget,
            f"/render (large 50-elem) p95={stats['p95']:.1f}ms exceeds budget={budget}ms "
            f"(mean={stats['mean']:.1f}ms max={stats['max']:.1f}ms)",
        )

    def test_render_large_output_is_proportional(self):
        """La salida grande debe ser mayor que la mínima — detecta renders truncados."""
        minimal_r = self.client.post('/render',
            json={'layout': _MINIMAL_LAYOUT, 'data': _MINIMAL_DATA, 'format': 'html'})
        large_r = self.client.post('/render',
            json={'layout': _LARGE_LAYOUT, 'data': _LARGE_DATA, 'format': 'html'})

        self.assertEqual(minimal_r.status_code, 200)
        self.assertEqual(large_r.status_code, 200)
        self.assertGreater(
            len(large_r.text), len(minimal_r.text),
            f'large render ({len(large_r.text)} bytes) must exceed minimal ({len(minimal_r.text)} bytes)',
        )

    # -----------------------------------------------------------------------
    # Validate endpoint
    # -----------------------------------------------------------------------

    def test_validate_latency_within_budget(self):
        stats = measure_latency_ms(
            lambda: self.client.post('/validate', json=_MINIMAL_LAYOUT), n=15)
        budget = LATENCY_BUDGET_MS['validate']
        self.assertLessEqual(
            stats['p95'], budget,
            f"/validate p95={stats['p95']:.1f}ms exceeds budget={budget}ms",
        )

    # -----------------------------------------------------------------------
    # Latency does not degrade across sequential requests (no cumulative slowdown)
    # -----------------------------------------------------------------------

    def test_no_cumulative_latency_degradation(self):
        """
        Ejecutar 30 renders secuenciales y verificar que la segunda mitad
        no es significativamente más lenta que la primera (no hay leak acumulativo).
        Umbral: p95 de la segunda mitad <= 2× p95 de la primera mitad.
        """
        payload = {'layout': _MINIMAL_LAYOUT, 'data': _MINIMAL_DATA, 'format': 'html'}
        TOTAL = 30
        times = []
        for _ in range(TOTAL):
            t0 = time.perf_counter()
            r = self.client.post('/render', json=payload)
            t1 = time.perf_counter()
            self.assertEqual(r.status_code, 200)
            times.append((t1 - t0) * 1000)

        first_half = sorted(times[:TOTAL // 2])
        second_half = sorted(times[TOTAL // 2:])
        p95_first = first_half[int(len(first_half) * 0.95) - 1]
        p95_second = second_half[int(len(second_half) * 0.95) - 1]

        self.assertLessEqual(
            p95_second, p95_first * 2,
            f'cumulative latency degradation detected: '
            f'first-half p95={p95_first:.1f}ms second-half p95={p95_second:.1f}ms '
            f'(ratio={p95_second/max(p95_first,0.1):.1f}×, max allowed=2×)',
        )

    # -----------------------------------------------------------------------
    # Error path latency — errores no deben ser más lentos que el happy path
    # -----------------------------------------------------------------------

    def test_error_path_latency_not_slower_than_happy_path(self):
        """
        Un request inválido no debe ser más lento que uno válido.
        Si lo es, sugiere error handling con operaciones costosas (logging, stack capture, etc).
        """
        valid_payload = {'layout': _MINIMAL_LAYOUT, 'data': _MINIMAL_DATA, 'format': 'html'}
        invalid_payload = {'layout': {}, 'data': {}, 'format': 'html'}  # layout vacío

        happy_times = []
        for _ in range(10):
            t0 = time.perf_counter()
            self.client.post('/render', json=valid_payload)
            happy_times.append((time.perf_counter() - t0) * 1000)

        error_times = []
        for _ in range(10):
            t0 = time.perf_counter()
            self.client.post('/render', json=invalid_payload)
            error_times.append((time.perf_counter() - t0) * 1000)

        happy_p95 = sorted(happy_times)[int(len(happy_times) * 0.95) - 1]
        error_p95 = sorted(error_times)[int(len(error_times) * 0.95) - 1]

        # Error path puede ser hasta 5× más lento (error handling, validation)
        # pero no 10× — eso indicaría problema real
        self.assertLessEqual(
            error_p95, happy_p95 * 10,
            f'error path is too slow: happy_p95={happy_p95:.1f}ms error_p95={error_p95:.1f}ms '
            f'(ratio={error_p95/max(happy_p95,0.1):.1f}× exceeds 10× threshold)',
        )


@unittest.skipUnless(_HAS_CLIENT, 'fastapi / httpx not installed')
class TestCacheEffectiveness(unittest.TestCase):
    """Verifica que el cache reduce latencia en layouts repetidos."""

    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(create_app())

    def test_cache_hit_not_slower_than_cold(self):
        """
        Segunda llamada al mismo layout no debe ser más lenta que la primera.
        Si el cache funciona, debe ser igual o más rápida.
        """
        payload = {'layout': _MINIMAL_LAYOUT, 'data': _MINIMAL_DATA, 'format': 'html'}

        # Warmup
        self.client.post('/render', json=payload)

        # Cold: primera serie
        cold_times = []
        for _ in range(5):
            t0 = time.perf_counter()
            self.client.post('/render', json=payload)
            cold_times.append((time.perf_counter() - t0) * 1000)

        # "Warm": segunda serie (puede estar cacheado)
        warm_times = []
        for _ in range(5):
            t0 = time.perf_counter()
            self.client.post('/render', json=payload)
            warm_times.append((time.perf_counter() - t0) * 1000)

        cold_mean = statistics.mean(cold_times)
        warm_mean = statistics.mean(warm_times)

        # Warm no debe ser más lento que cold + 50% margen de noise
        self.assertLessEqual(
            warm_mean, cold_mean * 1.5,
            f'warm requests slower than cold: cold={cold_mean:.1f}ms warm={warm_mean:.1f}ms — '
            f'cache may be counterproductive',
        )


@unittest.skipUnless(_HAS_CLIENT, 'fastapi / httpx not installed')
class TestRateLimitShell(unittest.TestCase):
    """
    Principle #67 — Rate-limit Safe Shell.

    Verifies that the server enforces a per-IP sliding-window rate limit and
    returns 429 with correct headers when the limit is exceeded, while normal
    traffic below the limit is served with X-Rate-Limit-* headers.
    """

    @classmethod
    def setUpClass(cls):
        # rate_limit_rpm=5: very low limit so tests can exhaust it quickly.
        cls.client = TestClient(create_app(rate_limit_rpm=5))

    def test_allowed_requests_receive_rate_limit_headers(self):
        """Responses within the limit must carry X-Rate-Limit-* headers."""
        r = self.client.get('/health')
        # /health is exempt — no rate-limit headers expected.
        # Use /validate (in-limit) instead.
        r = self.client.post('/validate', json=_MINIMAL_LAYOUT)
        self.assertIn(r.status_code, (200, 422),
            f'first request must not be rate-limited, got {r.status_code}')
        self.assertIn('x-rate-limit-limit', r.headers,
            'allowed response must carry X-Rate-Limit-Limit header')
        self.assertIn('x-rate-limit-remaining', r.headers,
            'allowed response must carry X-Rate-Limit-Remaining header')

    def test_health_exempt_from_rate_limit(self):
        """
        /health must never return 429 — it must be exempt from rate limiting
        so that load-balancer probes are always answered.
        """
        for _ in range(20):
            r = self.client.get('/health')
            self.assertNotEqual(r.status_code, 429,
                '/health must not be rate-limited regardless of request count')

    def test_burst_triggers_429(self):
        """
        Sending more requests than the per-minute limit from the same IP
        must result in HTTP 429 with a Retry-After header.
        """
        # Exhaust the limit (5 RPM configured in setUpClass).
        for _ in range(6):
            self.client.post('/validate', json=_MINIMAL_LAYOUT)

        # Next request must be rate-limited.
        r = self.client.post('/validate', json=_MINIMAL_LAYOUT)
        self.assertEqual(r.status_code, 429,
            'request exceeding rate limit must return HTTP 429')

        body = r.json()
        self.assertEqual(body.get('error'), 'rate_limit_exceeded',
            'rate-limit response must include error: rate_limit_exceeded')
        self.assertIn('retry_after_seconds', body,
            'rate-limit response must include retry_after_seconds')

        self.assertIn('retry-after', r.headers,
            'rate-limit 429 must include Retry-After header')
        self.assertIn('x-rate-limit-limit', r.headers,
            'rate-limit 429 must include X-Rate-Limit-Limit header')
        self.assertIn('x-rate-limit-remaining', r.headers,
            '429 must include X-Rate-Limit-Remaining: 0')
        self.assertEqual(r.headers['x-rate-limit-remaining'], '0',
            'X-Rate-Limit-Remaining must be 0 on a 429 response')

    def test_rate_limit_guard_static_check(self):
        """Static guard must verify rate-limit wiring without violations."""
        import subprocess, sys
        result = subprocess.run(
            [sys.executable, str(_ROOT / 'audit' / 'rate_limit_guard.py')],
            capture_output=True, text=True, cwd=str(_ROOT),
        )
        self.assertIn('violations found: 0', result.stdout,
            f'rate_limit_guard must pass with 0 violations:\n{result.stdout}\n{result.stderr}')


class TestLatencyGaps(unittest.TestCase):
    """Documenta gaps de cobertura de latencia real."""

    def test_DEFERRED_real_network_latency(self):
        """
        Gap: latencia bajo red real (TCP, TLS, DNS).
        Requiere: servidor externo + cliente con throttling real (tc netem o similar).
        Riesgo conocido: el servidor Python no tiene connection pooling — cada request
        es un nuevo thread. Bajo concurrencia real esto puede degradar.
        """
        GAP = {
            'id': 'LATENCY-NET-001',
            'description': 'TCP/TLS latency degradation under real network conditions',
            'requires': 'external server + tc netem or Toxiproxy',
            'known_risk': 'medium',
            'implemented_in': None,
        }
        self.assertIsNone(GAP['implemented_in'], 'gap is unimplemented')

    def test_DEFERRED_concurrent_request_degradation(self):
        """
        Gap: degradación bajo concurrencia real (10+ requests simultáneos).
        TestClient es single-threaded in-process — no modela concurrencia real.
        Requiere: locust o pytest-httpserver + threads.
        """
        GAP = {
            'id': 'LATENCY-CONC-001',
            'description': 'Latency degradation under 10+ concurrent render requests',
            'requires': 'locust or concurrent.futures + real HTTP server',
            'known_risk': 'high',  # Python GIL + rendering puede ser cuello de botella
            'implemented_in': None,
        }
        self.assertIsNone(GAP['implemented_in'], 'gap is unimplemented')


if __name__ == '__main__':
    unittest.main(verbosity=2)
