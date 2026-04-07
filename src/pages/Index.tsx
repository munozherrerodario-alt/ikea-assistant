import ChatBot from "@/components/ChatBot";
import { Package } from "lucide-react";

const Index = () => {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="text-center mb-6">
        <div className="inline-flex items-center gap-2 mb-2">
          <Package className="w-8 h-8 text-primary" />
          <h1 className="text-2xl font-bold text-foreground">Correos Express</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Consulta el estado de tu envío con nuestro asistente virtual
        </p>
      </div>
      <ChatBot />
    </div>
  );
};

export default Index;
