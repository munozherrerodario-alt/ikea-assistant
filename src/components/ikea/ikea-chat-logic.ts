import type { Slots, DetectedException } from "./ikea-chat-types";

// --- Validation ---
export const PEDIDO_RE = /^\d{9,12}$/;

export const FRUSTRATION_KEYWORDS = [
  "agente", "humano", "persona", "hablar con alguien", "no funciona",
  "inútil", "mierda", "basura", "incompetente", "harto", "estoy harto",
  "queja", "denuncia", "vergüenza", "asco", "fatal", "pésimo",
  "reclamar", "reclamación", "demanda",
];

export function detectFrustration(text: string): boolean {
  const lower = text.toLowerCase();
  return FRUSTRATION_KEYWORDS.some((k) => lower.includes(k));
}

export function detectMotivo(text: string): "devolucion" | "incidencia" | null {
  const lower = text.toLowerCase();
  if (/devol|devolver|reembols|retorn|cambiar.*producto/i.test(lower)) return "devolucion";
  if (/incidencia|problema|daño|roto|falta|defecto|queja|error|no funciona|montaje|transporte/i.test(lower)) return "incidencia";
  return null;
}

export function detectTipoIncidencia(text: string): string | null {
  const lower = text.toLowerCase();
  if (/plazo|tarde|retraso|fuera de tiempo/i.test(lower)) return "plazo";
  if (/montaje|montar|montado|armar/i.test(lower)) return "montaje";
  if (/transporte|envío|envio|daño|golpe|roto|rota|abollad/i.test(lower)) return "transporte";
  if (/defecto|defectuos|fallo|no funciona|avería/i.test(lower)) return "defecto";
  if (/falta|faltante|incompleto|pieza/i.test(lower)) return "faltante";
  return null;
}

export function detectEstadoProducto(text: string): string | null {
  const lower = text.toLowerCase();
  if (/montado|armado|ensamblado|instalado/i.test(lower)) return "montado";
  if (/sin abrir|cerrado|precintado|sellado|embalado/i.test(lower)) return "sin_abrir";
  if (/abierto|desembalado|sacado|usado/i.test(lower)) return "abierto";
  if (/nuevo|sin usar|sin estrenar/i.test(lower)) return "nuevo";
  return null;
}

// --- Exception detection ---
export function detectExceptions(slots: Slots): DetectedException[] {
  const exceptions: DetectedException[] = [];

  if (slots.diasDesdeCompra && slots.diasDesdeCompra > 30) {
    exceptions.push({
      type: "fuera_de_plazo",
      label: "Fuera de plazo",
      description: `Han pasado ${slots.diasDesdeCompra} días desde la compra (límite: 30 días)`,
    });
  }

  if (slots.estadoProducto === "montado") {
    exceptions.push({
      type: "producto_montado",
      label: "Producto montado",
      description: "El producto ya ha sido montado/ensamblado",
    });
  }

  if (slots.tipoIncidencia === "transporte") {
    exceptions.push({
      type: "incidencia_transporte_grave",
      label: "Incidencia de transporte",
      description: "Daños o problemas relacionados con el transporte",
    });
  }

  if (slots.tipoIncidencia === "faltante") {
    exceptions.push({
      type: "sin_prueba_entrega",
      label: "Posible falta de entrega",
      description: "Bultos faltantes en el pedido",
    });
  }

  return exceptions;
}

// --- Mock data ---
export const MOCK_ORDERS: Record<string, { producto: string; dias: number; promocion: boolean }> = {
  "123456789": { producto: "Estantería KALLAX", dias: 10, promocion: false },
  "987654321": { producto: "Sofá KIVIK", dias: 45, promocion: true },
  "111222333": { producto: "Lámpara HEKTAR", dias: 12, promocion: false },
  "444555666": { producto: "Mesa LACK", dias: 5, promocion: true },
};

export function buildHandoffSummary(slots: Slots, exceptions: DetectedException[]): string {
  const lines: string[] = [];
  if (slots.pedido) lines.push(`• Nº Pedido: ${slots.pedido}`);
  if (slots.producto) lines.push(`• Producto: ${slots.producto}`);
  if (slots.motivo) lines.push(`• Motivo: ${slots.motivo === "devolucion" ? "Devolución" : "Incidencia"}`);
  if (slots.tipoIncidencia) lines.push(`• Tipo: ${slots.tipoIncidencia}`);
  if (slots.diasDesdeCompra !== undefined) lines.push(`• Días desde compra: ${slots.diasDesdeCompra}`);
  if (slots.estadoProducto) lines.push(`• Estado del producto: ${slots.estadoProducto}`);
  if (exceptions.length > 0) {
    lines.push(`\n⚠️ Excepciones detectadas:`);
    exceptions.forEach((e) => lines.push(`  - ${e.label}: ${e.description}`));
  }
  return lines.join("\n");
}
