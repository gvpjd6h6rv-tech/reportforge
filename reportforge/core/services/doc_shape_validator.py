from __future__ import annotations

_REQUIRED_PATHS: dict[str, tuple[str, ...]] = {
    "factura": (
        "meta.doc_entry",
        "meta.doc_num",
        "meta.currency",
        "meta.obj_type",
        "empresa.razon_social",
        "empresa.ruc",
        "empresa.direccion_matriz",
        "empresa.obligado_contabilidad",
        "empresa.agente_retencion",
        "cliente.razon_social",
        "cliente.identificacion",
        "fiscal.ambiente",
        "fiscal.tipo_emision",
        "fiscal.numero_documento",
        "fiscal.numero_autorizacion",
        "fiscal.fecha_autorizacion",
        "fiscal.clave_acceso",
        "pago.forma_pago_fe",
        "pago.total",
        "totales.subtotal_12",
        "totales.subtotal_0",
        "totales.subtotal_sin_impuestos",
        "totales.iva_12",
        "totales.importe_total",
    ),
    "remision": (
        "meta.doc_entry",
        "meta.doc_num",
        "empresa.razon_social",
        "empresa.ruc",
        "destinatario.razon_social",
        "destinatario.identificacion",
        "fiscal.numero_documento",
        "fiscal.clave_acceso",
    ),
    "nota_credito": (
        "meta.doc_entry",
        "meta.doc_num",
        "empresa.razon_social",
        "empresa.ruc",
        "cliente.razon_social",
        "cliente.identificacion",
        "fiscal.numero_documento",
    ),
    "retencion": (
        "meta.doc_entry",
        "meta.doc_num",
        "empresa.razon_social",
        "empresa.ruc",
        "fiscal.numero_documento",
    ),
}

_FALLBACK_PATHS = _REQUIRED_PATHS["factura"]

_KNOWN_SECTIONS: frozenset[str] = frozenset({
    "meta", "empresa", "cliente", "fiscal", "pago", "items", "totales",
    "destinatario", "traslado", "origen", "destino",
    "proveedor", "doc_sustento", "impuestos", "doc_modificado",
})


def validate_dataset_shape(dataset: dict, doc_type: str = "factura") -> dict:
    """
    Validate dataset against required paths for the given doc_type.
    Returns {schemaOk, missingPaths, extraPaths, warnings}.
    Pure function — no I/O, no side effects.
    """
    required = _REQUIRED_PATHS.get(doc_type, _FALLBACK_PATHS)
    missing: list[str] = []

    for path in required:
        section, _, field = path.partition(".")
        if not field:
            if section not in dataset:
                missing.append(path)
        elif section not in dataset or field not in dataset[section]:
            missing.append(path)

    if "items" not in dataset or not isinstance(dataset.get("items"), list):
        missing.append("items")

    extra = [k for k in dataset if k not in _KNOWN_SECTIONS]

    warnings: list[str] = []
    for path in required:
        section, _, field = path.partition(".")
        if not field:
            continue
        if section in dataset and field in dataset[section]:
            val = dataset[section][field]
            if val is None or val == "":
                warnings.append(f"{path}: valor vacío")

    return {
        "schemaOk": len(missing) == 0,
        "missingPaths": missing,
        "extraPaths": extra,
        "warnings": warnings,
    }
