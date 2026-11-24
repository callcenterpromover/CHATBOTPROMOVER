// Catálogo ficticio para las pruebas (refleja los datos iniciales de la migración de Agendas).
import type { Catalogo, Franja, ServicioCita } from "./horarios";

const base = {
  nombre_visoft: null,
  menu: "PRINCIPAL",
  por_grupo_edad: false,
  edad_minima: null,
  agenda: null,
  autorizacion_salud_total: "NO",
  autorizacion_sos: "NO",
  ubicacion: null,
  profesional: null,
  notas_equipo: null,
  activo: true,
} as const;

export const SERVICIOS_PRUEBA: ServicioCita[] = [
  { ...base, id: 1, codigo: "VAL_FISIO_ST", nombre: "Valoración de fisioterapia", duracion_min: 15, eps: "SALUD_TOTAL", orden: 10 },
  { ...base, id: 2, codigo: "TF_ST", nombre: "Terapia física", duracion_min: 45, eps: "SALUD_TOTAL", orden: 20 },
  { ...base, id: 3, codigo: "VAL_FISIO_SOS", nombre: "Valoración de fisioterapia (OPS de terapia física integral)", duracion_min: 15, eps: "SOS", agenda: "FISIO_SOS", autorizacion_sos: "NO", orden: 10 },
  { ...base, id: 5, codigo: "FISIATRIA", nombre: "Fisiatría", nombre_visoft: "Consulta de primera vez con Medicina Física y Rehabilitación", duracion_min: 15, eps: "SOS", menu: "ESPECIALISTAS", edad_minima: 16, agenda: "ESPECIALISTAS_SOS", autorizacion_sos: "CONDICIONAL", orden: 30 },
  { ...base, id: 6, codigo: "ORTOPEDIA", nombre: "Ortopedia (UPI osteomuscular)", duracion_min: 15, eps: "SOS", menu: "ESPECIALISTAS", edad_minima: 16, agenda: "ESPECIALISTAS_SOS", autorizacion_sos: "CONDICIONAL", orden: 31 },
  { ...base, id: 9, codigo: "VAL_FONO", nombre: "Valoración de fonoaudiología", duracion_min: 15, eps: "TODAS", por_grupo_edad: true, autorizacion_salud_total: "SIEMPRE", autorizacion_sos: "SIEMPRE", orden: 40 },
  { ...base, id: 11, codigo: "VAL_RESPIRATORIA", nombre: "Valoración de terapia respiratoria", duracion_min: 30, eps: "TODAS", orden: 60 },
  { ...base, id: 12, codigo: "T_RESPIRATORIA", nombre: "Terapia respiratoria", duracion_min: 20, eps: "TODAS", orden: 70 },
  { ...base, id: 13, codigo: "VAL_SIN_HORARIO", nombre: "Valoración sin horario", duracion_min: 15, eps: "TODAS", orden: 80 },
];

const f = (servicio_id: number, dias: number[], hora_inicio: string, hora_fin: string, grupo_edad: Franja["grupo_edad"] = "TODOS"): Franja[] =>
  dias.map((dia_semana) => ({ servicio_id, grupo_edad, dia_semana, hora_inicio, hora_fin }));

const LV = [1, 2, 3, 4, 5];

export const CATALOGO_PRUEBA: Catalogo = {
  servicios: SERVICIOS_PRUEBA,
  edadCorteNinos: 18,
  franjas: [
    ...f(1, LV, "07:00", "12:15"),
    ...f(1, LV, "13:15", "17:00"),
    ...f(2, LV, "07:00", "12:15"),
    ...f(3, [1, 3, 4, 5], "07:00", "11:30"),
    ...f(3, [1, 5], "13:15", "16:15"),
    ...f(5, [2], "07:00", "12:15"),
    ...f(5, [4], "13:15", "17:00"),
    ...f(6, [2], "07:00", "12:15"),
    ...f(9, LV, "07:00", "08:45", "NINOS"),
    ...f(9, [1, 3], "13:15", "13:45", "ADULTOS"),
    ...f(11, LV, "11:00", "12:10"),
    ...f(12, LV, "11:00", "12:00"),
  ],
};
