import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import CFLogo from "@/components/CFLogo";

const Dashboard = () => {
  const { user, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-2">
            <CFLogo size="sm" />
            <span className="text-lg font-bold text-foreground">CompFlow</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">{user?.email}</span>
            <Button variant="ghost" size="sm" onClick={signOut}>Sign Out</Button>
          </div>
        </div>
      </header>
      <main className="container py-8">
        <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
        <p className="mt-2 text-muted-foreground">Welcome to CompFlow. Your dashboard is being built.</p>
      </main>
    </div>
  );
};

export default Dashboard;
