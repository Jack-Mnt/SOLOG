import { Check, Gem, Leaf, Orbit, Palette } from "lucide-react";
import { useState } from "react";
import { getStoredPalette, persistPalette, type SologPalette } from "./palette";

const OPTIONS: Array<{ value: SologPalette; label: string }> = [
  { value: "blue", label: "Azul" },
  { value: "violet", label: "Violeta" },
  { value: "green", label: "Verde" },
];

const HOME_LABELS: Record<SologPalette, string> = {
  blue: "Órbita",
  violet: "Prisma",
  green: "Natura",
};

const SIDEBAR_ICONS = { blue: Orbit, violet: Gem, green: Leaf };

export function PaletteSwitcher({
  collapsed = false,
  variant = "default",
}: {
  collapsed?: boolean;
  variant?: "default" | "sidebar" | "home";
} = {}) {
  const [palette, setPalette] = useState(getStoredPalette);

  const selectPalette = (nextPalette: SologPalette) => {
    setPalette(nextPalette);
    persistPalette(nextPalette);
  };

  const options = (
    <div className="palette-options">
      {OPTIONS.map((option) => (
        <button
          aria-label={`Usar paleta ${option.label}`}
          aria-pressed={palette === option.value}
          className={`palette-option palette-option--${option.value}`}
          key={option.value}
          onClick={() => selectPalette(option.value)}
          title={option.label}
          type="button"
        >
          {palette === option.value ? (
            <Check aria-hidden="true" size={13} strokeWidth={3} />
          ) : null}
        </button>
      ))}
    </div>
  );

  if (variant === "home") {
    return (
      <div
        className="cajero-home-appearance__options"
        aria-label="Paleta de color"
      >
        {OPTIONS.map((option) => (
          <button
            aria-pressed={palette === option.value}
            className="cajero-home-appearance__option"
            key={option.value}
            onClick={() => selectPalette(option.value)}
            type="button"
          >
            <span
              aria-hidden="true"
              className={"palette-option palette-option--" + option.value}
            />
            <span>{HOME_LABELS[option.value]}</span>
          </button>
        ))}
      </div>
    );
  }

  if (variant === "sidebar") {
    return <section className={"admin-appearance" + (collapsed ? " admin-appearance--collapsed" : "")} aria-label="Apariencia">
      {!collapsed && <span className="admin-main-tabs__label">APARIENCIA</span>}
      {OPTIONS.map(option => {
        const Icon = SIDEBAR_ICONS[option.value];
        return <button type="button" key={option.value} aria-label={HOME_LABELS[option.value]} title={collapsed ? HOME_LABELS[option.value] : undefined} aria-pressed={palette === option.value} onClick={() => selectPalette(option.value)}>
          <Icon aria-hidden="true" size={19} className={"admin-appearance__icon admin-appearance__icon--" + option.value} />
          {!collapsed && <span>{HOME_LABELS[option.value]}</span>}
          {!collapsed && palette === option.value && <Check className="admin-appearance__check" aria-hidden="true" size={16} />}
        </button>;
      })}
    </section>;
  }

  return (
    <div
      className="palette-switcher"
      aria-label="Paleta de color"
    >
      <Palette aria-hidden="true" size={18} strokeWidth={2} />
      {options}
    </div>
  );
}
