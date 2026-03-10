import { motion } from "framer-motion";

const stats = [
  { value: "10,000+", label: "Policies Tracked" },
  { value: "50+", label: "Carriers Supported" },
  { value: "Real-Time", label: "Commission Calc" },
];

const StatsSection = () => {
  return (
    <section className="border-t border-border bg-primary/5 py-16">
      <div className="container">
        <p className="mb-10 text-center text-sm font-medium uppercase tracking-widest text-muted-foreground">
          Built for agencies processing thousands of policies across dozens of carriers
        </p>
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
          {stats.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1, duration: 0.4 }}
              className="text-center"
            >
              <div className="text-4xl font-extrabold text-primary md:text-5xl">{stat.value}</div>
              <div className="mt-2 text-sm text-muted-foreground">{stat.label}</div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default StatsSection;
