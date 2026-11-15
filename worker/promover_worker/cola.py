"""Acceso a Supabase por su API REST con la clave secreta (solo conexiones salientes)."""

from __future__ import annotations

import platform
from datetime import datetime, timezone

import httpx

from .config import Config


class Cola:
    def __init__(self, cfg: Config):
        if not cfg.supabase_url or not cfg.supabase_secret_key:
            raise SystemExit("Falta SUPABASE_URL o SUPABASE_SECRET_KEY en worker/.env")
        self.cfg = cfg
        self.http = httpx.Client(
            base_url=f"{cfg.supabase_url}/rest/v1",
            headers={"apikey": cfg.supabase_secret_key, "Content-Type": "application/json"},
            timeout=30,
        )

    def _get(self, ruta: str, **params) -> list[dict]:
        r = self.http.get(ruta, params=params)
        r.raise_for_status()
        return r.json()

    def reclamar(self) -> dict | None:
        r = self.http.post("/rpc/reclamar_trabajo_ocr", json={})
        r.raise_for_status()
        filas = r.json()
        return filas[0] if filas else None

    def solicitud(self, solicitud_id: str) -> dict | None:
        filas = self._get("/solicitudes", id=f"eq.{solicitud_id}", select="*")
        return filas[0] if filas else None

    def paginas_historia(self, solicitud_id: str) -> int:
        return len(self._get(
            "/trabajos_ocr", solicitud_id=f"eq.{solicitud_id}", tipo_documento="eq.HISTORIA",
            estado="eq.COMPLETADO", select="id",
        ))

    def alertas_abiertas(self, solicitud_id: str) -> int:
        return len(self._get("/alertas", solicitud_id=f"eq.{solicitud_id}", resuelta="eq.false", select="id"))

    def guardar(self, trabajo_id: int, resultado: dict) -> bool:
        r = self.http.post("/rpc/guardar_resultado_ocr", json={"p_trabajo_id": trabajo_id, "p_resultado": resultado})
        r.raise_for_status()
        return r.json() is True

    def fallo_tecnico(self, trabajo: dict, codigo: str) -> str:
        """Reintenta hasta el máximo; después deja el trabajo en ERROR."""
        estado = "PENDIENTE" if trabajo["intentos"] < self.cfg.max_intentos else "ERROR"
        r = self.http.patch(
            "/trabajos_ocr", params={"id": f"eq.{trabajo['id']}", "estado": "eq.EN_PROCESO"},
            json={"estado": estado, "error_codigo": codigo},
        )
        r.raise_for_status()
        return estado

    def recuperar_interrumpidos(self) -> None:
        """Al arrancar: trabajos que quedaron EN_PROCESO por un apagón vuelven a la cola."""
        r = self.http.patch(
            "/trabajos_ocr", params={"estado": "eq.EN_PROCESO"},
            json={"estado": "PENDIENTE", "error_codigo": "interrumpido"},
        )
        r.raise_for_status()

    def latido(self, procesados: int, inicio: bool = False) -> None:
        """Actualiza la señal de vida del worker (una sola fila, sin datos de pacientes)."""
        fila = {
            "id": 1,
            "ultimo_latido": datetime.now(timezone.utc).isoformat(),
            "equipo": platform.node()[:60],
            "procesados_desde_inicio": procesados,
        }
        if inicio:
            fila["iniciado_en"] = fila["ultimo_latido"]
            fila["detenido_en"] = None
        r = self.http.post(
            "/estado_worker", params={"on_conflict": "id"}, json=fila,
            headers={"Prefer": "resolution=merge-duplicates"},
        )
        r.raise_for_status()

    def apagado(self) -> None:
        """Registra que el worker se apagó a propósito (el panel lo muestra como «Apagado»)."""
        r = self.http.post(
            "/estado_worker", params={"on_conflict": "id"},
            json={"id": 1, "detenido_en": datetime.now(timezone.utc).isoformat()},
            headers={"Prefer": "resolution=merge-duplicates"},
        )
        r.raise_for_status()

    def en_proceso(self) -> set[int]:
        return {f["id"] for f in self._get("/trabajos_ocr", estado="eq.EN_PROCESO", select="id")}
