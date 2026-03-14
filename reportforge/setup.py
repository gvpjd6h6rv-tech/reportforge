from setuptools import setup, find_packages

setup(
    name="reportforge",
    version="1.0.0",
    description="Motor de reportes PDF conectado a build_invoice_model",
    packages=find_packages(),
    python_requires=">=3.8",
    install_requires=["weasyprint>=60.0"],
    entry_points={
        "console_scripts": [
            "reportforge=core.render.cli:main",
        ],
    },
)
