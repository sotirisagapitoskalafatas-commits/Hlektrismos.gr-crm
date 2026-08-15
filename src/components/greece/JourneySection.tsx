import { ClientOnly } from "@tanstack/react-router";
import { motion, useScroll, useTransform, useReducedMotion } from "motion/react";
import { Suspense, lazy, useEffect, useRef, useState } from "react";

import { REGIONS } from "@/lib/regions";

const GreeceScene = lazy(() => import("./GreeceScene"));

export function JourneySection() {
  const wrapper = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion() ?? false;
  const [progress, setProgress] = useState(0);

  const { scrollYProgress } = useScroll({
    target: wrapper,
    offset: ["start start", "end end"],
  });

  useEffect(() => {
    const unsubscribe = scrollYProgress.on("change", (value) => setProgress(value));
    return () => unsubscribe();
  }, [scrollYProgress]);

  const active = Math.round(Math.min(Math.max(progress, 0), 1) * (REGIONS.length - 1));
  const mapOpacity = useTransform(scrollYProgress, [0, 0.06], [0.4, 1]);

  return (
    <section className="relative bg-surface" aria-label="Η ενέργεια ταξιδεύει μαζί σου">
      <div className="mx-auto max-w-7xl px-5 pt-16 lg:px-8 lg:pt-24">
        <h2 className="max-w-2xl text-3xl font-extrabold leading-tight sm:text-4xl">
          Η ενέργεια ταξιδεύει μαζί σου.
        </h2>
        <p className="mt-4 max-w-xl text-lg text-muted-foreground">
          Καθώς κατεβαίνεις, γνωρίζεις τις λύσεις μας σε κάθε γωνιά της Ελλάδας — από την Αθήνα
          μέχρι την Κρήτη.
        </p>
      </div>

      <div ref={wrapper} className="relative" style={{ height: `${REGIONS.length * 90}vh` }}>
        <div className="sticky top-0 h-screen overflow-hidden">
          <motion.div style={{ opacity: reduced ? 1 : mapOpacity }} className="absolute inset-0">
            <ClientOnly fallback={<div className="size-full bg-gradient-to-b from-background to-surface" />}>
              <Suspense fallback={<div className="size-full bg-gradient-to-b from-background to-surface" />}>
                <GreeceScene progress={progress} reducedMotion={reduced} />
              </Suspense>
            </ClientOnly>
          </motion.div>

          <div className="pointer-events-none absolute inset-0 flex items-center">
            <div className="mx-auto w-full max-w-7xl px-5 lg:px-8">
              <div className="relative max-w-md">
                {REGIONS.map((region, i) => (
                  <motion.article
                    key={region.id}
                    aria-hidden={i !== active}
                    animate={
                      i === active
                        ? { opacity: 1, y: 0, filter: "blur(0px)" }
                        : { opacity: 0, y: 28, filter: "blur(6px)" }
                    }
                    transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                    className={`glass-panel rounded-2xl p-7 shadow-lift ${
                      i === active ? "relative" : "absolute inset-x-0 top-0"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-display text-3xl font-extrabold text-primary/25">
                        {region.index}
                      </span>
                      <span className="text-xs font-semibold tracking-[0.14em] text-primary">
                        {region.area}
                      </span>
                    </div>
                    <h3 className="mt-4 text-2xl font-bold">{region.title}</h3>
                    <p className="mt-3 text-muted-foreground">{region.text}</p>
                    <p className="mt-5 inline-flex rounded-md bg-accent/20 px-3 py-1 text-sm font-semibold text-accent-foreground">
                      {region.city}
                    </p>
                  </motion.article>
                ))}
              </div>
            </div>
          </div>

          <div className="pointer-events-none absolute bottom-8 left-0 right-0">
            <div className="mx-auto flex max-w-7xl items-center gap-2 px-5 lg:px-8">
              {REGIONS.map((region, i) => (
                <span
                  key={region.id}
                  className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
                    i <= active ? "bg-primary" : "bg-primary/15"
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
