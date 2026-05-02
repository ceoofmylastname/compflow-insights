import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Globe, Palette, Mail, Users, Check } from "lucide-react";
import { motion } from "framer-motion";

const includes = [
  {
    icon: Globe,
    title: "Custom domain",
    description:
      "Run BaseshopHQ on your own URL — yourshop.com or app.yourshop.com. Agents never see our brand.",
  },
  {
    icon: Palette,
    title: "Your branding",
    description:
      "Upload your logo, set your colors, and the entire dashboard, login, and emails follow your identity.",
  },
  {
    icon: Mail,
    title: "Your voice in every email",
    description:
      "Invites, password resets, and notifications all go out from your domain with your sender name.",
  },
  {
    icon: Users,
    title: "Owner-only system access",
    description:
      "Your downline never sees “Powered by BaseshopHQ.” To them, the platform is yours.",
  },
];

const WhiteLabelSection = () => {
  return (
    <section id="white-label" className="border-t border-border bg-card/30 py-24">
      <div className="container">
        <div className="mb-12 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            Optional add-on · $97/mo
          </div>
          <h2 className="mt-4 text-3xl font-bold text-foreground md:text-4xl">
            Make BaseshopHQ Look Like Yours
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            The White-Label add-on turns BaseshopHQ into your branded platform.
            Your domain, your logo, your colors, your emails — every touchpoint your
            agents see.
          </p>
        </div>

        <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-2">
          {includes.map((item, i) => (
            <motion.div
              key={item.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1, duration: 0.4 }}
              className="flex gap-4 rounded-xl border border-border bg-card p-6"
            >
              <div className="shrink-0 rounded-lg bg-primary/10 p-3 h-fit">
                <item.icon className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-foreground">{item.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                  {item.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>

        <div className="mx-auto mt-12 max-w-3xl rounded-xl border border-border bg-card p-6 md:p-8">
          <h3 className="text-lg font-semibold text-foreground">How it works</h3>
          <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <Check className="h-4 w-4 text-success shrink-0 mt-0.5" />
              <span>
                Available on <span className="font-medium text-foreground">Growth, Pro, and Enterprise</span> plans.
                Not available on Starter.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <Check className="h-4 w-4 text-success shrink-0 mt-0.5" />
              <span>
                Toggle on inside Settings → Billing. Charged at <span className="font-medium text-foreground">$97/mo</span>,
                prorated immediately.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <Check className="h-4 w-4 text-success shrink-0 mt-0.5" />
              <span>
                Add a vanity domain (CNAME record) and we issue the SSL automatically. Most setups go live within 30 minutes.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <Check className="h-4 w-4 text-success shrink-0 mt-0.5" />
              <span>
                Cancel anytime. Removal takes effect at the end of your billing period — no immediate disruption to your agents.
              </span>
            </li>
          </ul>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link to="/signup?plan=growth&whiteLabel=1" className="flex-1">
              <Button className="w-full">Start with White-Label</Button>
            </Link>
            <a href="#pricing" className="flex-1">
              <Button variant="outline" className="w-full">See plan pricing</Button>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
};

export default WhiteLabelSection;
