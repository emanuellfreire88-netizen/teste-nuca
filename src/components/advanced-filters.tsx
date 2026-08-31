"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Filter, X, ChevronDown } from "lucide-react";

export interface FilterOption {
  key: string;
  label: string;
  type: "select" | "date" | "text";
  options?: Array<{ value: string; label: string }>;
  placeholder?: string;
}

export interface FilterValues {
  [key: string]: string;
}

interface AdvancedFiltersProps {
  filters: FilterOption[];
  values: FilterValues;
  onChange: (values: FilterValues) => void;
  onClear: () => void;
}

export function AdvancedFilters({ filters, values, onChange, onClear }: AdvancedFiltersProps) {
  const [open, setOpen] = useState(false);

  const activeCount = Object.values(values).filter(v => v && v !== "").length;

  const handleChange = (key: string, value: string) => {
    onChange({ ...values, [key]: value });
  };

  const handleClear = () => {
    onClear();
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8">
          <Filter className="h-3.5 w-3.5 mr-1" />
          Filtros
          {activeCount > 0 && (
            <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-xs">
              {activeCount}
            </Badge>
          )}
          <ChevronDown className="h-3 w-3 ml-1" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="start">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-semibold">Filtros</Label>
            {activeCount > 0 && (
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleClear}>
                <X className="h-3 w-3 mr-1" /> Limpar
              </Button>
            )}
          </div>

          {filters.map((filter) => (
            <div key={filter.key} className="space-y-1">
              <Label className="text-xs text-muted-foreground">{filter.label}</Label>
              {filter.type === "select" && filter.options ? (
                <Select
                  value={values[filter.key] || ""}
                  onValueChange={(v) => handleChange(filter.key, v === "__all__" ? "" : v)}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder={filter.placeholder || "Todos"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Todos</SelectItem>
                    {filter.options.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : filter.type === "date" ? (
                <Input
                  type="date"
                  value={values[filter.key] || ""}
                  onChange={(e) => handleChange(filter.key, e.target.value)}
                  className="h-8 text-sm"
                />
              ) : (
                <Input
                  value={values[filter.key] || ""}
                  onChange={(e) => handleChange(filter.key, e.target.value)}
                  placeholder={filter.placeholder || ""}
                  className="h-8 text-sm"
                />
              )}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
