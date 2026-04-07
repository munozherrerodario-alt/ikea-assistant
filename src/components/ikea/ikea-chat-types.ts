export interface Message {
  id: string;
  role: "user" | "bot";
  text: string;
}

export type Stage =
  | "welcome"
  | "ask_motivo"
  | "ask_pedido"
  | "ask_producto"
  | "ask_tipo_incidencia"
  | "ask_dias_compra"
  | "ask_estado_producto"
  | "ask_fotos"
  | "confirm"
  | "result"
  | "escalated";

export interface Slots {
  motivo?: "devolucion" | "incidencia";
  pedido?: string;
  producto?: string;
  tipoIncidencia?: string;
  diasDesdeCompra?: number;
  estadoProducto?: string;
  tieneFotos?: boolean;
}

export type ExceptionType =
  | "fuera_de_plazo"
  | "producto_montado"
  | "promocion_conjunta"
  | "incidencia_transporte_grave"
  | "sin_prueba_entrega"
  | "fraude_sospechoso";

export interface DetectedException {
  type: ExceptionType;
  label: string;
  description: string;
}
