import IkeaChatBot from "@/components/ikea/IkeaChatBot";
import { ShoppingBag } from "lucide-react";

const IkeaChat = () => {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="text-center mb-6">
        <div className="inline-flex items-center gap-2 mb-2">
          <ShoppingBag className="w-8 h-8 text-primary" />
          <h1 className="text-2xl font-bold text-foreground">IKEA</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Gestión de devoluciones e incidencias
        </p>
      </div>
      <IkeaChatBot />
    </div>
  );
};

export default IkeaChat;
