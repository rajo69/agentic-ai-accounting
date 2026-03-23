"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Sparkles, Tag, GitCompare, FileText, ArrowRight, CheckCircle2 } from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const features = [
  {
    icon: Tag,
    title: "Smart Categorisation",
    description:
      "AI reads your Xero transactions and assigns the correct account code — automatically, with full confidence scoring.",
    color: "bg-indigo-50 text-indigo-600",
  },
  {
    icon: GitCompare,
    title: "Bank Reconciliation",
    description:
      "Fuzzy-matching pairs bank statement lines to transactions so reconciliation takes minutes, not hours.",
    color: "bg-violet-50 text-violet-600",
  },
  {
    icon: FileText,
    title: "Management Letters",
    description:
      "Generate professional PDF management accounts with AI-written narrative — ready to send to clients.",
    color: "bg-sky-50 text-sky-600",
  },
];

const steps = [
  "Connect your Xero account in one click",
  "AI processes your transactions",
  "Review, approve, or correct suggestions",
  "Download polished management reports",
];

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1 } },
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-white">
      {/* Nav */}
      <nav className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-indigo-500 flex items-center justify-center shadow-lg shadow-indigo-500/40">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <span className="font-semibold text-[15px] tracking-tight">AI Accountant</span>
        </div>
        <a href={`${API_BASE}/auth/xero/connect`}>
          <Button size="sm" className="bg-indigo-600 hover:bg-indigo-500 text-white gap-2 shadow-lg shadow-indigo-600/30">
            Connect Xero
            <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </a>
      </nav>

      {/* Hero */}
      <motion.section
        initial="hidden"
        animate="show"
        variants={container}
        className="max-w-4xl mx-auto px-6 pt-24 pb-20 text-center"
      >
        <motion.div variants={item} className="inline-flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/20 rounded-full px-4 py-1.5 text-sm text-indigo-300 mb-8">
          <Sparkles className="w-3.5 h-3.5" />
          Built for UK accountants using Xero
        </motion.div>
        <motion.h1 variants={item} className="text-5xl sm:text-6xl font-bold leading-tight mb-6 bg-gradient-to-br from-white to-slate-300 bg-clip-text text-transparent">
          Your AI-powered<br />accounting assistant
        </motion.h1>
        <motion.p variants={item} className="text-lg text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed">
          Categorise transactions, reconcile bank statements, and generate management letters — with explainable AI that shows exactly how it reached every decision.
        </motion.p>
        <motion.div variants={item} className="flex flex-col sm:flex-row gap-4 justify-center">
          <a href={`${API_BASE}/auth/xero/connect`}>
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
              <Button size="lg" className="bg-indigo-600 hover:bg-indigo-500 text-white gap-2.5 px-8 shadow-xl shadow-indigo-600/30 text-base">
                <Sparkles className="w-5 h-5" />
                Connect with Xero — it&apos;s free
              </Button>
            </motion.div>
          </a>
        </motion.div>
      </motion.section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
          variants={container}
          className="grid sm:grid-cols-3 gap-6"
        >
          {features.map((f) => (
            <motion.div
              key={f.title}
              variants={item}
              whileHover={{ y: -4, transition: { duration: 0.2 } }}
              className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-6 backdrop-blur-sm"
            >
              <div className={`w-10 h-10 rounded-xl ${f.color} flex items-center justify-center mb-4`}>
                <f.icon className="w-5 h-5" />
              </div>
              <h3 className="font-semibold text-white mb-2">{f.title}</h3>
              <p className="text-sm text-slate-400 leading-relaxed">{f.description}</p>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* How it works */}
      <section className="max-w-3xl mx-auto px-6 py-16 text-center">
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
          variants={container}
        >
          <motion.h2 variants={item} className="text-2xl font-bold text-white mb-10">How it works</motion.h2>
          <div className="space-y-4">
            {steps.map((step, i) => (
              <motion.div
                key={i}
                variants={item}
                className="flex items-center gap-4 bg-white/[0.03] border border-white/[0.06] rounded-xl px-5 py-4 text-left"
              >
                <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center shrink-0 text-xs font-bold">
                  {i + 1}
                </div>
                <span className="text-slate-300 text-sm">{step}</span>
                {i === steps.length - 1 && <CheckCircle2 className="w-4 h-4 text-emerald-400 ml-auto shrink-0" />}
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* CTA */}
      <section className="max-w-2xl mx-auto px-6 py-20 text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4 }}
          className="bg-gradient-to-br from-indigo-600/20 to-violet-600/10 border border-indigo-500/20 rounded-3xl p-10"
        >
          <h2 className="text-2xl font-bold text-white mb-3">Ready to save hours every week?</h2>
          <p className="text-slate-400 text-sm mb-8">Connect your Xero account in 30 seconds. No credit card required.</p>
          <a href={`${API_BASE}/auth/xero/connect`}>
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="inline-block">
              <Button size="lg" className="bg-indigo-600 hover:bg-indigo-500 gap-2.5 px-10 shadow-xl shadow-indigo-600/30">
                <Sparkles className="w-5 h-5" />
                Get started free
              </Button>
            </motion.div>
          </a>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/[0.06] py-8">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <span>© 2026 AI Accountant · Built for UK accounting firms</span>
          <div className="flex gap-6">
            <a href="/privacy" className="hover:text-slate-300 transition-colors">Privacy Policy</a>
            <a href="mailto:hello@aiaccountant.app" className="hover:text-slate-300 transition-colors">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
