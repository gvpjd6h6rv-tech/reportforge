from __future__ import annotations


def _minimal_designer_html() -> str:
    return """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>ReportForge Designer</title>
<style>
  body { font-family: Arial, sans-serif; margin: 0; padding: 24px; background: #1e1e2e; color: #cdd6f4; }
  .card { max-width: 720px; margin: 0 auto; background: #313244; border: 1px solid #45475a; border-radius: 12px; padding: 24px; }
  h1 { color: #89b4fa; margin-bottom: 8px; }
  p { line-height: 1.5; color: #a6adc8; }
  code { background: #181825; padding: 2px 6px; border-radius: 6px; }
</style>
</head>
<body>
  <div class="card">
    <h1>ReportForge Designer</h1>
    <p>Fallback designer shell rendered because the primary HTML asset is missing.</p>
    <p>Start the app with <code>python3 reportforge_server.py</code> and open <code>/designer</code>.</p>
  </div>
</body>
</html>"""
