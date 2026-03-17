import { Link } from "react-router-dom";
import CFLogo from "@/components/CFLogo";

const Footer = () => {
  return (
    <footer className="border-t border-border bg-card/50 py-12">
      <div className="container">
        <div className="flex flex-col items-center justify-between gap-8 md:flex-row">
          <div className="flex items-center gap-2">
            <CFLogo size="sm" />
            <span className="text-lg font-bold text-foreground">BaseshopHQ</span>
          </div>

          <nav className="flex flex-wrap items-center justify-center gap-6">
            <button onClick={() => document.getElementById("features")?.scrollIntoView({ behavior: "smooth" })} className="text-sm text-muted-foreground hover:text-foreground transition-colors">Features</button>
            <button onClick={() => document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" })} className="text-sm text-muted-foreground hover:text-foreground transition-colors">Pricing</button>
            <Link to="/login" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Login</Link>
            <Link to="/signup" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Sign Up</Link>
            <span className="text-sm text-muted-foreground cursor-default">Privacy Policy</span>
            <span className="text-sm text-muted-foreground cursor-default">Terms of Service</span>
          </nav>
        </div>

        <div className="mt-8 text-center text-sm text-muted-foreground">
          © 2025 BaseshopHQ. All rights reserved.
        </div>
      </div>
    </footer>
  );
};

export default Footer;
