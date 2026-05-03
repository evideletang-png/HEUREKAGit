import { Navbar } from "./Navbar";

type AppShellProps = {
  children: React.ReactNode;
  className?: string;
  mainClassName?: string;
};

export function AppShell({ children, className = "bg-background", mainClassName }: AppShellProps) {
  return (
    <div className={`min-h-screen flex flex-col ${className}`}>
      <Navbar />
      <main className={mainClassName || "flex-1 w-full max-w-7xl mx-auto px-3 py-4 sm:px-4 sm:py-6 lg:px-8 lg:py-8 min-w-0"}>
        {children}
      </main>
    </div>
  );
}
