import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertLeadSchema, type InsertLead } from "@shared/schema";
import { useCreateLead } from "@/hooks/use-leads";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";

export default function Home() {
  const { mutate, isPending } = useCreateLead();
  
  const form = useForm<InsertLead>({
    resolver: zodResolver(insertLeadSchema),
    defaultValues: {
      email: "",
    },
  });

  const onSubmit = (data: InsertLead) => {
    mutate(data, {
      onSuccess: () => form.reset(),
    });
  };

  return (
    <div className="min-h-screen w-full flex flex-col justify-center items-center p-6 sm:p-12">
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="max-w-xl w-full space-y-12"
      >
        {/* Header Section */}
        <header className="space-y-6">
          <h1 className="text-6xl sm:text-8xl font-medium tracking-tighter">
            holdr
          </h1>
          <p className="text-lg sm:text-xl text-muted-foreground leading-relaxed max-w-md">
            The minimalist placeholder for your next big idea. 
            Secure your spot before it's gone.
          </p>
        </header>

        {/* Input Section */}
        <div className="pt-8 border-t border-border">
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <input
                  {...form.register("email")}
                  placeholder="enter your email..."
                  className="w-full bg-transparent border-b border-muted-foreground/30 py-3 px-0 text-lg focus:outline-none focus:border-black transition-colors placeholder:text-muted-foreground/50"
                  autoComplete="email"
                  disabled={isPending}
                />
                {form.formState.errors.email && (
                  <p className="mt-2 text-sm text-red-500">
                    {form.formState.errors.email.message}
                  </p>
                )}
              </div>
              
              <button
                type="submit"
                disabled={isPending}
                className="shrink-0 bg-black text-white px-8 py-3 text-lg hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isPending ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : (
                  "Notify me"
                )}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              * No spam. Just updates.
            </p>
          </form>
        </div>

        {/* Footer */}
        <footer className="pt-24 flex justify-between text-xs text-muted-foreground uppercase tracking-widest">
          <span>© 2024 holdr inc.</span>
          <span>SFO — NYC — LDN</span>
        </footer>
      </motion.div>
    </div>
  );
}
