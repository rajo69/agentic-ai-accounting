"use client";

import { useRef, useState, type MouseEvent, type ReactNode } from "react";
import { motion, useMotionValue, useSpring, useMotionTemplate } from "framer-motion";

interface FluidGlassButtonProps {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "glass";
  className?: string;
  type?: "button" | "submit" | "reset";
}

export default function FluidGlassButton({
  children,
  onClick,
  disabled = false,
  variant = "glass",
  className = "",
  type = "button",
}: FluidGlassButtonProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const [hovered, setHovered] = useState(false);

  // Spring-tracked mouse position for fluid shimmer
  const mouseX = useMotionValue(50);
  const mouseY = useMotionValue(50);
  const springX = useSpring(mouseX, { stiffness: 350, damping: 25 });
  const springY = useSpring(mouseY, { stiffness: 350, damping: 25 });

  const isPrimary = variant === "primary";

  const shimmerBgPrimary = useMotionTemplate`radial-gradient(circle at ${springX}% ${springY}%, rgba(255,255,255,0.18) 0%, transparent 60%)`;
  const shimmerBgGlass = useMotionTemplate`radial-gradient(circle at ${springX}% ${springY}%, rgba(255,255,255,0.10) 0%, transparent 60%)`;

  function handleMouseMove(e: MouseEvent<HTMLButtonElement>) {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    mouseX.set(((e.clientX - rect.left) / rect.width) * 100);
    mouseY.set(((e.clientY - rect.top) / rect.height) * 100);
  }

  function handleMouseLeave() {
    setHovered(false);
    mouseX.set(50);
    mouseY.set(50);
  }

  return (
    <motion.button
      ref={ref}
      type={type}
      disabled={disabled}
      onClick={onClick}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={handleMouseLeave}
      whileHover={{ scale: disabled ? 1 : 1.02 }}
      whileTap={{ scale: disabled ? 1 : 0.97 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      className={`
        relative overflow-hidden rounded-lg px-4 py-2 text-sm font-medium
        outline-none select-none
        disabled:opacity-50 disabled:cursor-not-allowed
        ${isPrimary
          ? "bg-indigo-600 text-white border border-indigo-500 shadow-lg shadow-indigo-600/25 hover:bg-indigo-500 transition-colors duration-200"
          : "bg-white/[0.06] text-zinc-300 border border-white/[0.1] hover:border-white/[0.2] hover:text-white transition-colors duration-200"
        }
        ${className}
      `}
      style={
        !isPrimary
          ? { backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }
          : undefined
      }
    >
      {/* Spring-tracked shimmer */}
      <motion.span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[inherit] transition-opacity duration-200"
        style={{
          opacity: hovered ? 1 : 0,
          background: isPrimary ? shimmerBgPrimary : shimmerBgGlass,
        }}
      />
      {/* Top inset highlight */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px rounded-t-lg"
        style={{
          background: isPrimary
            ? "linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)"
            : "linear-gradient(90deg, transparent, rgba(255,255,255,0.12), transparent)",
        }}
      />
      <span className="relative flex items-center gap-2">{children}</span>
    </motion.button>
  );
}
