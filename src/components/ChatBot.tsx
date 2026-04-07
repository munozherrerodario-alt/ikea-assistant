import { useState, useRef, useEffect, useCallback } from "react";
import { Send, User, Bot, Phone, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

// --- Types ---
interface Message {
  id: string;
  role: "user" | "bot";
  text: string;
}

type Stage =
  | "welcome"
  | "ask_localizador"
  | "ask_telefono"
  | "ask_telefono_fallback"
  | "ask_referencia"
  | "confirm"
  | "result"
  | "escalated";

interface Slots {
  localizador?: string;
  telefono?: string;
  referencia?: string;
}

// --- Validation ---
const LOCALIZADOR_RE = /^CE-\d{4}-\d{5}-ES$/i;
const TELEFONO_RE = /^[679]\d{8}$/;

const FRUSTRATION_KEYWORDS = [
  "agente", "humano", "persona", "hablar con alguien", "no funciona",
  "inútil", "mierda", "basura", "incompetente", "harto", "estoy harto",
  "queja", "denuncia", "vergüenza", "asco", "fatal", "pésimo",
];

function detectFrustration(text: string): boolean {
  const lower = text.toLowerCase();
  return FRUSTRATION_KEYWORDS.some((k) => lower.includes(k));
}

// --- Simulated shipment data ---
const MOCK_STATUSES: Record<string, string> = {
  "CE-1234-56789-ES":
    "📦 Tu envío está en tránsito. Salió del centro logístico de Madrid esta mañana y la entrega estimada es mañana entre las 10:00 y las 14:00.",
  "CE-0000-00001-ES":
    "✅ Tu envío fue entregado el 05/04/2026 a las 11:32 en la dirección indicada. Firmó: J. García.",
  "CE-9999-12345-ES":
    "🔄 Tu envío está pendiente de recogida en el punto de conveniencia más cercano (C/ Gran Vía 45, Madrid). Tienes 7 días para recogerlo.",
};

function lookupShipment(localizador: string): string {
  const key = localizador.toUpperCase();
  return (
    MOCK_STATUSES[key] ??
    `📦 Tu envío con localizador ${localizador} se encuentra actualmente en procesamiento en el centro logístico. Te llegará en las próximas 24-48 horas.`
  );
}

// --- Component ---
export default function ChatBot() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [stage, setStage] = useState<Stage>("welcome");
  const [slots, setSlots] = useState<Slots>({});
  const [retries, setRetries] = useState({ localizador: 0, telefono: 0 });
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const initialized = useRef(false);

  const addMessage = useCallback(
    (role: "user" | "bot", text: string) => {
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role, text },
      ]);
    },
    []
  );

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
    botSay(
      "¡Hola! 👋 Soy el asistente virtual de Correos Express. ¿En qué puedo ayudarte hoy?"
    );
    setTimeout(() => setStage("ask_localizador"), 900);
  }, [botSay]);

  // Auto-scroll
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, isTyping]);

  // --- Escalate ---
  const escalate = useCallback(() => {
    setStage("escalated");
    const resumen = [];
    if (slots.localizador) resumen.push(`Localizador: ${slots.localizador}`);
    if (slots.telefono) resumen.push(`Teléfono: ${slots.telefono}`);
    if (slots.referencia) resumen.push(`Referencia: ${slots.referencia}`);
    const summary = resumen.length
      ? `\n\n📋 Resumen del caso:\n${resumen.join("\n")}`
      : "";
    botSay(
      `Te pongo en contacto con un agente ahora mismo. Le trasladaré el resumen de tu caso para que no tengas que repetir nada.${summary}`,
      1000
    );
  }, [slots, botSay]);

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
      case "ask_localizador":
        handleLocalizador(text);
        break;
      case "ask_telefono":
      case "ask_telefono_fallback":
        handleTelefono(text);
        break;
      case "ask_referencia":
        handleReferencia(text);
        break;
      case "confirm":
        handleConfirmation(text);
        break;
    }
  };

  const handleLocalizador = (text: string) => {
    // Check if user says they don't have it
    const noTiene =
      /no (lo )?tengo|no sé|no se|no recuerdo|no lo encuentro|no dispongo/i.test(
        text
      );
    if (noTiene) {
      setStage("ask_telefono_fallback");
      botSay(
        "No te preocupes, podemos intentarlo por otra vía. ¿Me puedes facilitar el número de teléfono del destinatario? (9 dígitos, empezando por 6, 7 o 9)"
      );
      return;
    }

    // Try to extract localizador from text
    const match = text.match(/CE-\d{4}-\d{5}-ES/i);
    const candidate = match ? match[0].toUpperCase() : text.trim().toUpperCase();

    if (LOCALIZADOR_RE.test(candidate)) {
      setSlots((s) => ({ ...s, localizador: candidate }));
      setStage("ask_telefono");
      botSay(
        "Perfecto, he registrado tu localizador. Ahora necesito el número de teléfono del destinatario para verificar tu identidad. (9 dígitos)"
      );
    } else {
      const r = retries.localizador + 1;
      setRetries((prev) => ({ ...prev, localizador: r }));
      if (r >= 2) {
        setStage("ask_telefono_fallback");
        botSay(
          "Veo que estás teniendo dificultades con el localizador. No te preocupes, podemos buscarlo con tu número de teléfono. ¿Me lo facilitas? (9 dígitos, empezando por 6, 7 o 9)"
        );
      } else {
        botSay(
          "Ese localizador no coincide con el formato habitual. El formato correcto es CE-XXXX-XXXXX-ES (por ejemplo: CE-1234-56789-ES). ¿Puedes comprobarlo?"
        );
      }
    }
  };

  const handleTelefono = (text: string) => {
    const digits = text.replace(/\s+/g, "").replace(/^\+34/, "");
    if (TELEFONO_RE.test(digits)) {
      setSlots((s) => ({ ...s, telefono: digits }));
      // If no localizador, simulate finding shipments
      if (!slots.localizador) {
        // Simulate ambiguity for demo
        if (digits === "612345678") {
          setStage("ask_referencia");
          botSay(
            "He encontrado varios envíos asociados a ese teléfono. ¿Tienes alguna referencia de pedido para poder identificar el correcto?"
          );
          return;
        }
        // Simulate finding one
        const fakeLoc = "CE-1234-56789-ES";
        setSlots((s) => ({ ...s, localizador: fakeLoc }));
      }
      goToConfirm(slots.localizador || "CE-1234-56789-ES", digits);
    } else {
      const r = retries.telefono + 1;
      setRetries((prev) => ({ ...prev, telefono: r }));
      if (r >= 2) {
        botSay(
          "Sigo sin poder validar el teléfono. Si lo prefieres, puedo transferirte a un agente que te ayude personalmente. ¿Quieres que lo haga?"
        );
        // Next input will be treated as confirmation to escalate or retry
      } else {
        botSay(
          "El número de teléfono debe tener 9 dígitos y empezar por 6, 7 o 9. Por ejemplo: 612345678. ¿Puedes volver a intentarlo?"
        );
      }
    }
  };

  const handleReferencia = (text: string) => {
    setSlots((s) => ({ ...s, referencia: text.trim() }));
    const loc = slots.localizador || "CE-1234-56789-ES";
    setSlots((s) => ({ ...s, localizador: loc }));
    goToConfirm(loc, slots.telefono!);
  };

  const goToConfirm = (loc: string, tel: string) => {
    setStage("confirm");
    const ref = slots.referencia
      ? `\n• Referencia: ${slots.referencia}`
      : "";
    botSay(
      `Antes de consultar, confirmo los datos:\n\n• Localizador: ${loc}\n• Teléfono: ${tel}${ref}\n\n¿Es correcto? (sí/no)`
    );
  };

  const handleConfirmation = (text: string) => {
    const lower = text.toLowerCase();
    if (/^(sí|si|s[ií]|correcto|ok|vale|exacto|afirmativo|yes)\b/.test(lower)) {
      setStage("result");
      const loc = slots.localizador!;
      const status = lookupShipment(loc);
      botSay(
        `${status}\n\n¿Necesitas algo más? Si es así, puedes escribirme en cualquier momento. ¡Gracias por usar Correos Express! 😊`,
        1200
      );
    } else if (/^(no|nop|negativo|incorrecto)/.test(lower)) {
      setSlots({});
      setRetries({ localizador: 0, telefono: 0 });
      setStage("ask_localizador");
      botSay(
        "De acuerdo, empecemos de nuevo. ¿Me puedes facilitar tu número de localizador? (Formato: CE-XXXX-XXXXX-ES)"
      );
    } else {
      botSay("Por favor, respóndeme con 'sí' o 'no' para confirmar los datos.");
    }
  };

  return (
    <div className="flex flex-col h-[600px] max-h-[80vh] w-full max-w-md rounded-2xl overflow-hidden shadow-2xl border border-border bg-card">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 bg-chat-header">
        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary-foreground/20">
          <Bot className="w-5 h-5 text-chat-header-foreground" />
        </div>
        <div>
          <h1 className="text-base font-semibold text-chat-header-foreground">
            Correos Express
          </h1>
          <p className="text-xs text-chat-header-foreground/70">
            Asistente virtual • En línea
          </p>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 px-4 py-3" ref={scrollRef as any}>
        <div className="flex flex-col gap-3">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex animate-fade-in ${
                msg.role === "user" ? "justify-end" : "justify-start"
              }`}
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

          {/* Typing indicator */}
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
          Transferido a un agente humano
        </div>
      )}

      {/* Input */}
      <div className="border-t border-border px-4 py-3 bg-card">
        {stage === "escalated" || stage === "result" ? (
          <p className="text-xs text-muted-foreground text-center py-1">
            {stage === "escalated"
              ? "Un agente se pondrá en contacto contigo en breve."
              : "Conversación finalizada. ¡Gracias por contactarnos!"}
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
