import { ProgressLoader } from "@/components/ProgressLoader";

// Se muestra mientras carga cualquier pantalla del panel; desaparece al llegar el contenido.
export default function Cargando() {
  return <ProgressLoader />;
}
