"use client";

import { useState } from "react";
import { HexColorPicker, HexColorInput } from "react-colorful";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const PRESETS = [
  "#000000", "#434343", "#666666", "#999999", "#b7b7b7", "#cccccc", "#d9d9d9", "#ffffff",
  "#ff0000", "#ff4500", "#ff9900", "#ffff00", "#00ff00", "#00ffff", "#4a86e8", "#0000ff",
  "#9900ff", "#ff00ff", "#e06666", "#f6b26b", "#ffd966", "#93c47d", "#76a5af", "#6fa8dc",
  "#8e7cc3", "#c27ba0",
];

interface ColorPickerProps {
  color: string;
  onChange: (color: string) => void;
  tip: string;
  icon: React.ReactNode;
}

export default function ColorPicker({ color, onChange, tip, icon }: ColorPickerProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              onMouseDown={(e) => e.preventDefault()}
              className={cn(
                "inline-flex flex-col items-center justify-center w-8 h-8 rounded-md shrink-0",
                "hover:bg-accent hover:text-accent-foreground transition-colors",
                "focus-visible:outline-none",
                open && "bg-accent text-accent-foreground"
              )}
            >
              {icon}
              <span
                className="w-4 h-[3px] rounded-sm border border-black/10 mt-0.5"
                style={{ background: color }}
              />
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">{tip}</TooltipContent>
      </Tooltip>

      <PopoverContent
        side="bottom"
        align="start"
        className="w-auto p-3 space-y-3"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {/* react-colorful picker */}
        <HexColorPicker
          color={color}
          onChange={onChange}
          style={{ width: "200px", height: "160px" }}
        />

        {/* Hex input */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground font-mono">#</span>
          <HexColorInput
            color={color}
            onChange={onChange}
            prefixed={false}
            className="flex-1 h-7 text-xs font-mono border border-input rounded px-2 bg-background focus:outline-none focus:ring-1 focus:ring-ring uppercase"
          />
          <span
            className="w-7 h-7 rounded border border-input shrink-0"
            style={{ background: color }}
          />
        </div>

        {/* Preset renkler */}
        <div className="grid grid-cols-8 gap-1">
          {PRESETS.map((p) => (
            <button
              key={p}
              onMouseDown={(e) => { e.preventDefault(); onChange(p); }}
              className="w-5 h-5 rounded-sm border border-black/10 hover:scale-110 transition-transform shrink-0"
              style={{ background: p }}
              title={p}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
