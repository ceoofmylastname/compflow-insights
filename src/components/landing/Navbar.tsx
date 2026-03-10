import { Link } from "react-router-dom";
import CFLogo from "@/components/CFLogo";
import ThemeToggle from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";

const Navbar = () => {
  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <header className="fixed top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-xl">
      <div className="container flex h-16 items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <CFLogo size="sm" />
          <span className="text-lg font-bold text-foreground">CompFlow</span>
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          <button onClick={() => scrollToSection("features")} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
            Features
          </button>
          <button onClick={() => scrollToSection("how-it-works")} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
            How It Works
          </button>
          <button onClick={() => scrollToSection("pricing")} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
            Pricing
          </button>
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link to="/login">
            <Button variant="ghost" size="sm">Log In</Button>
          </Link>
          <Link to="/signup">
            <Button size="sm">Start Free</Button>
          </Link>
        </div>
      </div>
    </header>
  );
};

export default Navbar;
