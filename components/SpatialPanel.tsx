"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

interface Props {
  id: string;
  title: string;
  initialX?: number;
  initialY?: number;
  width?: number;
  children: React.ReactNode;
  onClose: () => void;
  gazeFocused?: boolean;
}

export function SpatialPanel({
  id,
  title,
  initialX,
  initialY,
  width = 340,
  children,
  onClose,
  gazeFocused = false,
}: Props) {
  const [pos, setPos] = useState({
    x:
      initialX ??
      (typeof window !== "undefined" ? window.innerWidth / 2 - width / 2 : 100),
    y: initialY ?? 120,
  });
  const scale = 1;
  const dragRef = useRef<{ dragging: boolean; offX: number; offY: number }>({
    dragging: false,
    offX: 0,
    offY: 0,
  });

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current.dragging) return;
      setPos({
        x: e.clientX - dragRef.current.offX,
        y: e.clientY - dragRef.current.offY,
      });
    };
    const onUp = () => {
      dragRef.current.dragging = false;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const onHeaderDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    dragRef.current = {
      dragging: true,
      offX: e.clientX - pos.x,
      offY: e.clientY - pos.y,
    };
    e.preventDefault();
  };

  return (
    <div
      id={id}
      data-gaze-target="true"
      className="fixed z-[100] rounded-2xl shadow-[0_32px_80px_rgba(0,0,0,0.5)] transition-[border-color,box-shadow] duration-200"
      style={{
        width,
        transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})`,
        transformOrigin: "top left",
        background: "rgba(255,255,255,0.07)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        border: gazeFocused
          ? "1px solid rgba(99,102,241,0.6)"
          : "1px solid rgba(255,255,255,0.10)",
        boxShadow: gazeFocused
          ? "0 32px 80px rgba(0,0,0,0.5), 0 0 40px rgba(99,102,241,0.2)"
          : "0 32px 80px rgba(0,0,0,0.5)",
      }}
    >
      {/* Header */}
      <div
        className="panel-header flex items-center justify-between px-5 py-4 border-b border-white/[0.07]"
        onMouseDown={onHeaderDown}
      >
        <span className="font-semibold text-sm text-white">{title}</span>
        <button
          onClick={onClose}
          className="flex items-center justify-center w-7 h-7 rounded-lg bg-white/[0.07] hover:bg-white/[0.15] text-zinc-400 hover:text-white transition-all duration-150 cursor-pointer"
        >
          <X size={13} />
        </button>
      </div>

      {/* Body */}
      <div className="p-5">{children}</div>
    </div>
  );
}
