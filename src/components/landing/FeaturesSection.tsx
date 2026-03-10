import { GitBranch, Clock, BarChart3 } from "lucide-react";
import { motion } from "framer-motion";

const features = [
  {
    icon: GitBranch,
    title: "Hierarchy That Actually Works",
    description:
      "Map every agent to their direct upline by email. Your downline tree builds itself. Every report, every commission, scoped automatically by position.",
  },
  {
    icon: Clock,
    title: "Commission Rates That Time-Travel",
    description:
      "When a policy is written, CompFlow looks up the commission rate that was active on the Application Date — not today. Historical accuracy, zero manual math.",
  },
  {
    icon: BarChart3,
    title: "Every Carrier. One Dashboard.",
    description:
      "Upload policy CSVs from any carrier. CompFlow normalizes the data, maps the writing agent by NPN, and calculates payouts across your entire book.",
  },
];

const FeaturesSection = () => {
  return (
    <section id="features" className="border-t border-border bg-card/30 py-24">
      <div className="container">
        <div className="mb-16 text-center">
          <h2 className="text-3xl font-bold text-foreground md:text-4xl">
            Built for How Agencies Actually Work
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Not another generic CRM. CompFlow is purpose-built for commission tracking and hierarchy management.
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-3">
          {features.map((feature, i) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.15, duration: 0.5 }}
              className="group rounded-xl border border-border bg-card p-8 transition-colors hover:border-primary/40"
            >
              <div className="mb-4 inline-flex rounded-lg bg-primary/10 p-3">
                <feature.icon className="h-6 w-6 text-primary" />
              </div>
              <h3 className="mb-3 text-xl font-semibold text-foreground">{feature.title}</h3>
              <p className="text-muted-foreground leading-relaxed">{feature.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FeaturesSection;
