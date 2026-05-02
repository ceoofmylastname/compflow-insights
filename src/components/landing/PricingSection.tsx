import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const tiers = [
  {
    name: "Starter",
    price: "$97",
    period: "/mo",
    description: "Solo producers and brand-new base shops",
    features: [
      "Up to 3 agents",
      "Unlimited policies",
      "Carrier CSV/Excel imports",
      "Hierarchy & commission tracking",
      "14-day free trial",
    ],
    popular: false,
    cta: "Start 14-day trial",
    ctaTo: "/signup?plan=starter",
  },
  {
    name: "Growth",
    price: "$297",
    period: "/mo",
    description: "Growing teams ready to scale",
    features: [
      "Up to 10 agents",
      "Everything in Starter",
      "White-label add-on eligible",
      "Webhook integrations",
      "Priority email support",
    ],
    popular: false,
    cta: "Start 14-day trial",
    ctaTo: "/signup?plan=growth",
  },
  {
    name: "Pro",
    price: "$497",
    period: "/mo",
    description: "Established agencies running a real base shop",
    features: [
      "Up to 50 agents",
      "Everything in Growth",
      "White-label add-on eligible",
      "Advanced reporting",
      "Priority support",
    ],
    popular: true,
    cta: "Start 14-day trial",
    ctaTo: "/signup?plan=pro",
  },
  {
    name: "Enterprise",
    price: "$25",
    period: "/active agent/mo",
    description: "50+ agents or custom contracts",
    features: [
      "Unlimited agents",
      "Active-agent metered billing",
      "White-label add-on eligible",
      "Custom integrations",
      "Dedicated success manager",
    ],
    popular: false,
    cta: "Contact sales",
    ctaTo: "/signup?plan=enterprise",
  },
];

const PricingSection = () => {
  return (
    <section id="pricing" className="border-t border-border py-24">
      <div className="container">
        <div className="mb-16 text-center">
          <h2 className="text-3xl font-bold text-foreground md:text-4xl">Simple, Transparent Pricing</h2>
          <p className="mt-4 text-lg text-muted-foreground">
            No setup fee. 14-day free trial on all self-serve plans.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Optional white-label add-on: <span className="font-medium text-foreground">$97/mo</span> (Growth, Pro, Enterprise).
          </p>
        </div>

        <div className="mx-auto grid max-w-6xl gap-6 md:grid-cols-2 lg:grid-cols-4">
          {tiers.map((tier) => (
            <div
              key={tier.name}
              className={cn(
                "relative flex flex-col rounded-xl border p-6",
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
                <span className="text-sm text-muted-foreground">{tier.period}</span>
              </div>
              <ul className="mt-8 flex-1 space-y-3">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <Check className="h-4 w-4 text-success shrink-0 mt-0.5" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Link to={tier.ctaTo} className="mt-8">
                <Button className="w-full" variant={tier.popular ? "default" : "outline"}>
                  {tier.cta}
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
