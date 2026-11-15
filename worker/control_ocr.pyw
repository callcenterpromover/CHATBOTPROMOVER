"""Ventana pequeña para encender y apagar el OCR de PROMOVER en este equipo.

El OCR corre como un proceso aparte: cerrar esta ventana NO lo apaga. Para apagarlo hay que usar
el botón. Se abre con el ícono «OCR PROMOVER» del escritorio.
"""

from __future__ import annotations

import os
import sys
import threading
import tkinter as tk
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from promover_worker import control  # noqa: E402
from promover_worker.config import RAIZ  # noqa: E402

VERDE, GRIS, AMBAR, TEAL, TEAL_OSCURO, ROJO = "#059669", "#94a3b8", "#d97706", "#0f766e", "#115e59", "#be123c"
FONDO, TEXTO, SUAVE = "#ffffff", "#0f172a", "#64748b"


class Ventana:
    def __init__(self, raiz: tk.Tk):
        self.raiz = raiz
        self.ocupado = False
        raiz.title("OCR PROMOVER")
        raiz.configure(bg=FONDO, padx=22, pady=18)
        raiz.resizable(False, False)
        icono = RAIZ / "recursos" / "ocr.ico"
        if icono.exists():
            try:
                raiz.iconbitmap(str(icono))
            except tk.TclError:
                pass

        tk.Label(raiz, text="PROMOVER S.A.S.", bg=FONDO, fg=TEAL, font=("Segoe UI", 8, "bold")).pack(anchor="w")
        tk.Label(raiz, text="Lector de documentos (OCR)", bg=FONDO, fg=TEXTO, font=("Segoe UI", 12, "bold")).pack(anchor="w")

        fila = tk.Frame(raiz, bg=FONDO)
        fila.pack(anchor="w", pady=(14, 14))
        self.luz = tk.Canvas(fila, width=16, height=16, bg=FONDO, highlightthickness=0)
        self.punto = self.luz.create_oval(2, 2, 14, 14, fill=GRIS, outline="")
        self.luz.pack(side="left")
        self.estado = tk.Label(fila, text="Revisando…", bg=FONDO, fg=TEXTO, font=("Segoe UI", 11))
        self.estado.pack(side="left", padx=(8, 0))

        self.boton = tk.Button(
            raiz, text="…", width=22, height=2, relief="flat", cursor="hand2", font=("Segoe UI", 10, "bold"),
            fg="white", bg=TEAL, activebackground=TEAL_OSCURO, activeforeground="white", command=self.alternar,
        )
        self.boton.pack(fill="x")

        self.nota = tk.Label(
            raiz, text="", bg=FONDO, fg=SUAVE, font=("Segoe UI", 8), wraplength=260, justify="left",
        )
        self.nota.pack(anchor="w", pady=(10, 0))

        enlace = tk.Label(raiz, text="Ver registro", bg=FONDO, fg=TEAL, cursor="hand2", font=("Segoe UI", 8, "underline"))
        enlace.pack(anchor="w", pady=(6, 0))
        enlace.bind("<Button-1>", lambda _e: self.ver_registro())

        self.refrescar()

    # ---------------------------------------------------------------- estado
    def pintar(self, encendido: bool, texto: str | None = None):
        if encendido:
            self.luz.itemconfig(self.punto, fill=VERDE)
            self.estado.config(text=texto or "Encendido")
            self.boton.config(text="Apagar OCR", bg=ROJO, activebackground="#9f1239")
            self.nota.config(text="Puedes cerrar esta ventana: el OCR seguirá funcionando en segundo plano.")
        else:
            self.luz.itemconfig(self.punto, fill=GRIS)
            self.estado.config(text=texto or "Apagado")
            self.boton.config(text="Encender OCR", bg=TEAL, activebackground=TEAL_OSCURO)
            self.nota.config(text="Mientras esté apagado, los documentos esperan en la cola y no se pierden.")

    def refrescar(self):
        if not self.ocupado:
            self.pintar(control.encendido())
        self.raiz.after(2000, self.refrescar)

    # ---------------------------------------------------------------- acciones
    def alternar(self):
        if self.ocupado:
            return
        self.ocupado = True
        self.boton.config(state="disabled")
        encender = not control.encendido()
        self.luz.itemconfig(self.punto, fill=AMBAR)
        self.estado.config(text="Encendiendo…" if encender else "Apagando… (termina el documento en curso)")
        threading.Thread(target=self._trabajar, args=(encender,), daemon=True).start()

    def _trabajar(self, encender: bool):
        try:
            if encender:
                control.encender()
                # Espera a que el proceso aparezca (hasta 10 s).
                for _ in range(20):
                    if control.encendido():
                        break
                    threading.Event().wait(0.5)
                resultado = "Encendido" if control.encendido() else "No se pudo encender (ver registro)"
            else:
                r = control.apagar()
                resultado = {"forzado": "Apagado (se interrumpió un documento)"}.get(r, "Apagado")
        except Exception as e:  # noqa: BLE001 - se muestra al usuario sin datos sensibles
            resultado = f"Error: {type(e).__name__}"
        self.raiz.after(0, self._terminar, resultado)

    def _terminar(self, resultado: str):
        self.ocupado = False
        self.boton.config(state="normal")
        self.pintar(control.encendido(), resultado if not resultado.startswith(("Encendido", "Apagado")) else None)

    def ver_registro(self):
        registro = RAIZ / "logs" / "worker.log"
        if registro.exists():
            os.startfile(registro)  # noqa: S606 - abre el archivo con el programa predeterminado


def principal():
    if sys.platform == "win32":
        try:  # texto nítido en pantallas con escala
            import ctypes

            ctypes.windll.shcore.SetProcessDpiAwareness(1)
        except (AttributeError, OSError):
            pass
    raiz = tk.Tk()
    Ventana(raiz)
    raiz.mainloop()


if __name__ == "__main__":
    principal()
