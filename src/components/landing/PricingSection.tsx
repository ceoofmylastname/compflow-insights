import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const tiers = [
  {
    name: "Starter",
    price: "$49",
    period: "/mo",
    description: "For small agencies getting started",
    features: ["Up to 10 agents", "Unlimited policies", "CSV imports", "Commission tracking", "Email support"],
    popular: false,
  },
  {
    name: "Agency",
    price: "$149",
    period: "/mo",
    description: "For growing agencies",
    features: ["Up to 50 agents", "Unlimited policies", "CSV imports", "Commission tracking", "Hierarchy management", "Webhook integrations", "Priority support"],
    popular: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    description: "For large organizations",
    features: ["Unlimited agents", "Unlimited policies", "CSV imports", "Commission tracking", "Hierarchy management", "Webhook integrations", "Dedicated support", "Custom integrations"],
    popular: false,
  },
];

const PricingSection = () => {
  return (
    <section id="pricing" className="border-t border-border py-24">
      <div className="container">
        <div className="mb-16 text-center">
          <h2 className="text-3xl font-bold text-foreground md:text-4xl">Simple, Transparent Pricing</h2>
          <p className="mt-4 text-lg text-muted-foreground">Start free. Upgrade when you're ready.</p>
        </div>

        <div className="mx-auto grid max-w-5xl gap-8 md:grid-cols-3">
          {tiers.map((tier) => (
            <div
              key={tier.name}
              className={cn(
                "relative flex flex-col rounded-xl border p-8",
                tier.popular
                  ? "border-primary bg-card shadow-lg shadow-primary/10"
                  : "border-border bg-card"
              )}
            >
              {tier.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-4 py-1 text-xs font-semibold text-primary-foreground">
                  Most Popular
                </div>
              )}
              <h3 className="text-xl font-bold text-foreground">{tier.name}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{tier.description}</p>
              <div className="mt-6 flex items-baseline gap-1">
                <span className="text-4xl font-extrabold text-foreground">{tier.price}</span>
                <span className="text-muted-foreground">{tier.period}</span>
              </div>
              <ul className="mt-8 flex-1 space-y-3">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Check className="h-4 w-4 text-success" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link to="/signup" className="mt-8">
                <Button className="w-full" variant={tier.popular ? "default" : "outline"}>
                  Start Free
                </Button>
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default PricingSection;
