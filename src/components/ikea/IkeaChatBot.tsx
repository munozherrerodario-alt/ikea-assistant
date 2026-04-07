import { useState, useRef, useEffect, useCallback } from "react";
import { Send, User, Bot, Phone, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Message, Stage, Slots, DetectedException } from "./ikea-chat-types";
import {
  PEDIDO_RE,
  detectFrustration,
  detectMotivo,
  detectTipoIncidencia,
  detectEstadoProducto,
  detectExceptions,
  MOCK_ORDERS,
  buildHandoffSummary,
} from "./ikea-chat-logic";

export default function IkeaChatBot() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [stage, setStage] = useState<Stage>("welcome");
  const [slots, setSlots] = useState<Slots>({});
  const [retries, setRetries] = useState<Record<string, number>>({});
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const initialized = useRef(false);

  const addMessage = useCallback((role: "user" | "bot", text: string) => {
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role, text }]);
  }, []);

  const botSay = useCallback(
    (text: string, delay = 800) => {
      setIsTyping(true);
      setTimeout(() => {
        setIsTyping(false);
        addMessage("bot", text);
      }, delay);
    },
    [addMessage]
  );

  // Welcome
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    botSay("¡Hola! 👋 Soy el asistente virtual de IKEA. Estoy aquí para ayudarte con devoluciones e incidencias. ¿Qué necesitas hoy?");
    setTimeout(() => setStage("ask_motivo"), 900);
  }, [botSay]);

  // Auto-scroll
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, isTyping]);

  const getRetry = (key: string) => retries[key] || 0;
  const incRetry = (key: string) => {
    const val = getRetry(key) + 1;
    setRetries((p) => ({ ...p, [key]: val }));
    return val;
  };

  // --- Escalate ---
  const escalate = useCallback(
    (exceptions: DetectedException[] = []) => {
      setStage("escalated");
      const summary = buildHandoffSummary(slots, exceptions);
      botSay(
        `Te voy a pasar con un especialista. Le enviaré toda la información para que no tengas que repetir nada.\n\n📋 Resumen del caso:\n${summary}`,
        1000
      );
    },
    [slots, botSay]
  );

  // --- Process user input ---
  const handleSend = () => {
    const text = input.trim();
    if (!text || stage === "escalated" || stage === "result") return;
    addMessage("user", text);
    setInput("");

    if (detectFrustration(text)) {
      escalate();
      return;
    }

    switch (stage) {
      case "welcome":
      case "ask_motivo":
        handleMotivo(text);
        break;
      case "ask_pedido":
        handlePedido(text);
        break;
      case "ask_producto":
        handleProducto(text);
        break;
      case "ask_tipo_incidencia":
        handleTipoIncidencia(text);
        break;
      case "ask_dias_compra":
        handleDiasCompra(text);
        break;
      case "ask_estado_producto":
        handleEstadoProducto(text);
        break;
      case "ask_fotos":
        handleFotos(text);
        break;
      case "confirm":
        handleConfirmation(text);
        break;
    }
  };

  const handleMotivo = (text: string) => {
    const motivo = detectMotivo(text);
    if (motivo) {
      setSlots((s) => ({ ...s, motivo }));
      setStage("ask_pedido");
      botSay(
        motivo === "devolucion"
          ? "Entendido, quieres hacer una devolución. Para localizarla necesito tu número de pedido. Lo encontrarás en el email de confirmación o en tu cuenta de IKEA. (9-12 dígitos)"
          : "Entendido, vamos a gestionar tu incidencia. ¿Me puedes facilitar el número de pedido? Lo encontrarás en el email de confirmación. (9-12 dígitos)"
      );
    } else {
      const r = incRetry("motivo");
      if (r >= 2) {
        escalate();
      } else {
        botSay("¿Quieres hacer una devolución de un producto o reportar una incidencia (daño, defecto, problema con el envío)? Dime con cuál puedo ayudarte.");
      }
    }
  };

  const handlePedido = (text: string) => {
    const digits = text.replace(/[\s-]/g, "");
    if (PEDIDO_RE.test(digits)) {
      const order = MOCK_ORDERS[digits];
      if (order) {
        setSlots((s) => ({
          ...s,
          pedido: digits,
          producto: order.producto,
          diasDesdeCompra: order.dias,
        }));
        setStage("ask_tipo_incidencia");
        botSay(
          `He encontrado tu pedido: **${order.producto}** (hace ${order.dias} días). ¿Cuál es el motivo de tu ${slots.motivo === "devolucion" ? "devolución" : "incidencia"}? Por ejemplo: defecto, daño en transporte, montaje, piezas faltantes...`
        );
      } else {
        setSlots((s) => ({ ...s, pedido: digits }));
        setStage("ask_producto");
        botSay("He registrado tu número de pedido. ¿Qué producto está afectado?");
      }
    } else {
      const r = incRetry("pedido");
      if (r >= 2) {
        botSay("No consigo validar el número de pedido. ¿Quieres que te pase con un agente que pueda buscarlo de otra manera?");
        setStage("confirm"); // reuse confirm for escalation offer
        setSlots((s) => ({ ...s, _escalateOnYes: true } as any));
      } else {
        botSay("El número de pedido suele tener entre 9 y 12 dígitos. Lo encontrarás en tu email de confirmación de IKEA. ¿Puedes comprobarlo?");
      }
    }
  };

  const handleProducto = (text: string) => {
    setSlots((s) => ({ ...s, producto: text.trim() }));
    setStage("ask_tipo_incidencia");
    botSay(`Perfecto, he anotado "${text.trim()}". ¿Cuál es el problema? (defecto, daño en transporte, montaje, piezas faltantes, plazo...)`);
  };

  const handleTipoIncidencia = (text: string) => {
    const tipo = detectTipoIncidencia(text);
    if (tipo) {
      setSlots((s) => ({ ...s, tipoIncidencia: tipo }));
      if (tipo === "montaje") {
        setStage("ask_estado_producto");
        botSay("¿El producto ya ha sido montado o aún está sin montar?");
      } else if (tipo === "transporte") {
        setStage("ask_fotos");
        botSay("Lamento los daños en el transporte. ¿Podrías facilitarnos fotos del producto y el embalaje? (sí/no)");
      } else if (slots.diasDesdeCompra === undefined) {
        setStage("ask_dias_compra");
        botSay("¿Hace cuántos días realizaste la compra aproximadamente?");
      } else {
        goToEstadoOrConfirm();
      }
    } else {
      const r = incRetry("tipo");
      if (r >= 2) {
        escalate();
      } else {
        botSay("¿Podrías concretar un poco más? Por ejemplo: ¿es un defecto de fábrica, daño durante el transporte, problema con el montaje o faltan piezas?");
      }
    }
  };

  const handleDiasCompra = (text: string) => {
    const match = text.match(/\d+/);
    if (match) {
      const dias = parseInt(match[0], 10);
      setSlots((s) => ({ ...s, diasDesdeCompra: dias }));
      goToEstadoOrConfirm();
    } else {
      const r = incRetry("dias");
      if (r >= 2) {
        escalate();
      } else {
        botSay("Solo necesito un número aproximado de días. Por ejemplo: 5, 15, 40...");
      }
    }
  };

  const handleEstadoProducto = (text: string) => {
    const estado = detectEstadoProducto(text);
    if (estado) {
      setSlots((s) => ({ ...s, estadoProducto: estado }));
      if (slots.diasDesdeCompra === undefined) {
        setStage("ask_dias_compra");
        botSay("¿Hace cuántos días realizaste la compra?");
      } else {
        goToConfirm();
      }
    } else {
      const r = incRetry("estado");
      if (r >= 2) {
        escalate();
      } else {
        botSay("¿El producto está montado, sin abrir, abierto o es nuevo sin usar?");
      }
    }
  };

  const handleFotos = (text: string) => {
    const lower = text.toLowerCase();
    const hasFotos = /^(sí|si|s[ií]|ok|vale|claro|tengo|puedo)/.test(lower);
    setSlots((s) => ({ ...s, tieneFotos: hasFotos }));
    if (slots.diasDesdeCompra === undefined) {
      setStage("ask_dias_compra");
      botSay(hasFotos
        ? "Perfecto, las revisaremos. ¿Hace cuántos días realizaste la compra?"
        : "De acuerdo, no te preocupes. ¿Hace cuántos días realizaste la compra?");
    } else {
      goToConfirm();
    }
  };

  const goToEstadoOrConfirm = () => {
    if (!slots.estadoProducto && (slots.motivo === "devolucion" || slots.tipoIncidencia === "montaje")) {
      setStage("ask_estado_producto");
      botSay("¿En qué estado se encuentra el producto? (montado, sin abrir, abierto, nuevo...)");
    } else {
      goToConfirm();
    }
  };

  const goToConfirm = () => {
    setStage("confirm");
    const motivo = slots.motivo === "devolucion" ? "Devolución" : "Incidencia";
    const lines = [
      `Antes de continuar, confirmo los datos:`,
      ``,
      `• Motivo: ${motivo}`,
    ];
    if (slots.pedido) lines.push(`• Nº Pedido: ${slots.pedido}`);
    if (slots.producto) lines.push(`• Producto: ${slots.producto}`);
    if (slots.tipoIncidencia) lines.push(`• Tipo: ${slots.tipoIncidencia}`);
    if (slots.diasDesdeCompra !== undefined) lines.push(`• Días desde compra: ${slots.diasDesdeCompra}`);
    if (slots.estadoProducto) lines.push(`• Estado: ${slots.estadoProducto}`);
    lines.push(`\n¿Es correcto? (sí/no)`);
    botSay(lines.join("\n"));
  };

  const handleConfirmation = (text: string) => {
    const lower = text.toLowerCase();

    // Check if this was an escalation offer after retries
    if ((slots as any)._escalateOnYes) {
      if (/^(sí|si|s[ií]|ok|vale|claro|yes)\b/.test(lower)) {
        escalate();
        return;
      }
      // Reset and go back
      setSlots((s) => { const { _escalateOnYes, ...rest } = s as any; return rest; });
      setStage("ask_pedido");
      setRetries((p) => ({ ...p, pedido: 0 }));
      botSay("De acuerdo, intentemos de nuevo. ¿Me facilitas el número de pedido?");
      return;
    }

    if (/^(sí|si|s[ií]|correcto|ok|vale|exacto|afirmativo|yes)\b/.test(lower)) {
      const exceptions = detectExceptions(slots);
      if (exceptions.length > 0) {
        escalate(exceptions);
      } else {
        setStage("result");
        botSay(
          `✅ Tu solicitud de ${slots.motivo === "devolucion" ? "devolución" : "incidencia"} ha sido registrada correctamente.\n\n📧 Recibirás un email de confirmación con los próximos pasos en las próximas 24 horas.\n\n¿Necesitas algo más? ¡Gracias por contactar con IKEA! 😊`,
          1200
        );
      }
    } else if (/^(no|nop|negativo|incorrecto)/.test(lower)) {
      setSlots({});
      setRetries({});
      setStage("ask_motivo");
      botSay("De acuerdo, empecemos de nuevo. ¿Necesitas hacer una devolución o reportar una incidencia?");
    } else {
      botSay("Por favor, respóndeme con 'sí' o 'no' para confirmar los datos.");
    }
  };

  return (
    <div className="flex flex-col h-[600px] max-h-[80vh] w-full max-w-md rounded-2xl overflow-hidden shadow-2xl border border-border bg-card">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 bg-chat-header">
        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary-foreground/20">
          <ShoppingBag className="w-5 h-5 text-chat-header-foreground" />
        </div>
        <div>
          <h1 className="text-base font-semibold text-chat-header-foreground">IKEA</h1>
          <p className="text-xs text-chat-header-foreground/70">Asistente virtual • Devoluciones e incidencias</p>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 px-4 py-3" ref={scrollRef as any}>
        <div className="flex flex-col gap-3">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex animate-fade-in ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div className="flex items-end gap-2 max-w-[85%]">
                {msg.role === "bot" && (
                  <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary flex items-center justify-center">
                    <Bot className="w-3.5 h-3.5 text-primary-foreground" />
                  </div>
                )}
                <div
                  className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-line ${
                    msg.role === "user"
                      ? "bg-chat-user text-chat-user-foreground rounded-br-md"
                      : "bg-chat-bot text-chat-bot-foreground rounded-bl-md"
                  }`}
                >
                  {msg.text}
                </div>
                {msg.role === "user" && (
                  <div className="flex-shrink-0 w-7 h-7 rounded-full bg-muted flex items-center justify-center">
                    <User className="w-3.5 h-3.5 text-muted-foreground" />
                  </div>
                )}
              </div>
            </div>
          ))}

          {isTyping && (
            <div className="flex justify-start animate-fade-in">
              <div className="flex items-end gap-2">
                <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary flex items-center justify-center">
                  <Bot className="w-3.5 h-3.5 text-primary-foreground" />
                </div>
                <div className="bg-chat-bot px-4 py-3 rounded-2xl rounded-bl-md flex gap-1.5">
                  <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-typing-dot" style={{ animationDelay: "0s" }} />
                  <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-typing-dot" style={{ animationDelay: "0.2s" }} />
                  <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-typing-dot" style={{ animationDelay: "0.4s" }} />
                </div>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Escalated banner */}
      {stage === "escalated" && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-secondary text-secondary-foreground text-xs font-medium">
          <Phone className="w-4 h-4" />
          Transferido a un especialista de IKEA
        </div>
      )}

      {/* Input */}
      <div className="border-t border-border px-4 py-3 bg-card">
        {stage === "escalated" || stage === "result" ? (
          <p className="text-xs text-muted-foreground text-center py-1">
            {stage === "escalated"
              ? "Un especialista se pondrá en contacto contigo en breve."
              : "Solicitud registrada. ¡Gracias por contactar con IKEA!"}
          </p>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-center gap-2"
          >
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Escribe tu mensaje..."
              className="flex-1 rounded-full bg-muted border-0 focus-visible:ring-primary"
              disabled={isTyping}
            />
            <Button
              type="submit"
              size="icon"
              className="rounded-full shrink-0"
              disabled={!input.trim() || isTyping}
            >
              <Send className="w-4 h-4" />
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
