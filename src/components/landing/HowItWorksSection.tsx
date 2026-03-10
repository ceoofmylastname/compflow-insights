import { Upload, Settings, Zap } from "lucide-react";
import { motion } from "framer-motion";

const steps = [
  {
    icon: Upload,
    step: "01",
    title: "Import Your Agent Roster",
    description: "Upload a CSV with names, emails, NPNs, and upline references. Your hierarchy builds automatically.",
  },
  {
    icon: Settings,
    step: "02",
    title: "Upload Commission Schedules",
    description: "Add your commission level schedules per carrier, product, and position. Historical rates supported.",
  },
  {
    icon: Zap,
    step: "03",
    title: "Drop In Policy Reports",
    description: "Upload policy CSVs from any carrier. CompFlow maps agents by NPN, calculates payouts, and does the rest.",
  },
];

const HowItWorksSection = () => {
  return (
    <section id="how-it-works" className="border-t border-border py-24">
      <div className="container">
        <div className="mb-16 text-center">
          <h2 className="text-3xl font-bold text-foreground md:text-4xl">
            Up and Running in Minutes
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">Three steps to automated commission tracking.</p>
        </div>

        <div className="grid gap-8 md:grid-cols-3">
          {steps.map((s, i) => (
            <motion.div
              key={s.step}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.15, duration: 0.5 }}
              className="relative text-center"
            >
              <div className="mb-6 text-5xl font-black text-primary/20">{s.step}</div>
              <div className="mx-auto mb-4 inline-flex rounded-full bg-primary/10 p-4">
                <s.icon className="h-7 w-7 text-primary" />
              </div>
              <h3 className="mb-3 text-xl font-semibold text-foreground">{s.title}</h3>
              <p className="text-muted-foreground">{s.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default HowItWorksSection;
